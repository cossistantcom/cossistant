terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

variable "api_webhook_base_url" {
  description = "Base URL for the API that will receive SES bridge webhooks."
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy SES, S3, Lambda, SNS, and SQS resources in."
  type        = string
  default     = "us-east-1"
}

variable "configuration_set_name" {
  description = "Optional override for the SES configuration set name."
  type        = string
  default     = ""
}

variable "create_route53_records" {
  description = "Whether to create Route53 records automatically when route53_zone_id is provided."
  type        = bool
  default     = true
}

variable "environment" {
  description = "Environment name used for resource naming."
  type        = string
  default     = "dev"
}

variable "incoming_email_retention_days" {
  description = "How long to keep inbound raw emails in S3 before expiration."
  type        = number
  default     = 30
}

variable "inbound_bucket_name" {
  description = "Globally unique S3 bucket name for raw inbound SES emails."
  type        = string
}

variable "inbound_domain" {
  description = "Inbound reply domain that SES should receive mail for, for example ses-inbound.example.com."
  type        = string
}

variable "lambda_memory_size" {
  description = "Memory size for the SES adapter Lambdas."
  type        = number
  default     = 256
}

variable "lambda_timeout_seconds" {
  description = "Timeout for the SES adapter Lambdas."
  type        = number
  default     = 30
}

variable "mail_from_subdomain" {
  description = "Subdomain to use for the optional custom MAIL FROM domain."
  type        = string
  default     = "mail"
}

variable "receipt_rule_set_name" {
  description = "Optional override for the SES receipt rule set name."
  type        = string
  default     = ""
}

variable "resend_inbound_domain" {
  description = "Existing Resend inbound domain kept alive during migration overlap."
  type        = string
  default     = "inbound.cossistant.com"
}

variable "resource_prefix" {
  description = "Prefix used for naming SES bridge resources."
  type        = string
  default     = "cossistant-email"
}

variable "route53_zone_id" {
  description = "Optional Route53 hosted zone id for automatic DNS record creation."
  type        = string
  default     = ""
}

variable "sender_domain" {
  description = "Verified SES sender domain, usually your root domain such as example.com."
  type        = string
}

variable "ses_webhook_secret" {
  description = "Shared secret used by the bridge Lambdas to sign webhook payloads."
  type        = string
  sensitive   = true
}

variable "webhook_timeout_ms" {
  description = "Timeout for the Lambda adapters when posting signed webhooks back to the API."
  type        = number
  default     = 15000
}

locals {
  repo_root = abspath("${path.module}/../../..")

  create_dns             = var.create_route53_records && var.route53_zone_id != ""
  configuration_set_name = var.configuration_set_name != "" ? var.configuration_set_name : "${var.resource_prefix}-${var.environment}"
  event_queue_name       = "${var.resource_prefix}-events-${var.environment}"
  inbound_queue_name     = "${var.resource_prefix}-inbound-${var.environment}"
  lambda_role_name       = "${var.resource_prefix}-lambda-${var.environment}"
  mail_from_domain       = "${var.mail_from_subdomain}.${var.sender_domain}"
  receipt_rule_name      = "${var.resource_prefix}-${var.environment}-store-inbound"
  receipt_rule_set_name  = var.receipt_rule_set_name != "" ? var.receipt_rule_set_name : "${var.resource_prefix}-${var.environment}"
  sender_user_name       = "${var.resource_prefix}-sender-${var.environment}"

  inbound_webhook_url = "${trimsuffix(var.api_webhook_base_url, "/")}/ses/webhooks/inbound"
  event_webhook_url   = "${trimsuffix(var.api_webhook_base_url, "/")}/ses/webhooks/events"

  lambda_source_files = sort(fileset("${path.module}/lambda-src", "**/*.ts"))
  lambda_source_hashes = [
    for file in local.lambda_source_files : filesha256("${path.module}/lambda-src/${file}")
  ]

  bun_inputs = [
    filesha256("${local.repo_root}/package.json"),
    filesha256("${local.repo_root}/bun.lock")
  ]

  inbound_lambda_hash = base64sha256(join("", concat(local.lambda_source_hashes, local.bun_inputs, ["inbound"])))
  event_lambda_hash   = base64sha256(join("", concat(local.lambda_source_hashes, local.bun_inputs, ["events"])))

  dns_records = concat(
    [
      {
        name    = "_amazonses.${var.sender_domain}"
        type    = "TXT"
        ttl     = 600
        records = ["\"${aws_ses_domain_identity.sender.verification_token}\""]
      },
      {
        name    = var.inbound_domain
        type    = "MX"
        ttl     = 600
        records = ["10 inbound-smtp.${var.aws_region}.amazonaws.com"]
      },
      {
        name    = local.mail_from_domain
        type    = "MX"
        ttl     = 600
        records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
      },
      {
        name    = local.mail_from_domain
        type    = "TXT"
        ttl     = 600
        records = ["\"v=spf1 include:amazonses.com ~all\""]
      }
    ],
    [
      for token in aws_ses_domain_dkim.sender.dkim_tokens : {
        name    = "${token}._domainkey.${var.sender_domain}"
        type    = "CNAME"
        ttl     = 600
        records = ["${token}.dkim.amazonses.com"]
      }
    ]
  )
}

resource "terraform_data" "build_lambda_artifacts" {
  triggers_replace = concat(local.lambda_source_hashes, local.bun_inputs)

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      mkdir -p "${path.module}/lambda-dist"
      cd "${local.repo_root}"
      bun build "${path.module}/lambda-src/inbound/handler.ts" --target=node --format=esm --outfile "${path.module}/lambda-dist/inbound.mjs"
      bun build "${path.module}/lambda-src/events/handler.ts" --target=node --format=esm --outfile "${path.module}/lambda-dist/events.mjs"
      cd "${path.module}/lambda-dist"
      rm -f inbound.zip events.zip
      zip -q -j inbound.zip inbound.mjs
      zip -q -j events.zip events.mjs
    EOT
  }
}

resource "aws_s3_bucket" "inbound" {
  bucket        = var.inbound_bucket_name
  force_destroy = true

  tags = {
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  rule {
    id     = "expire-raw-inbound-email"
    status = "Enabled"

    filter {}

    expiration {
      days = var.incoming_email_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "inbound" {
  bucket = aws_s3_bucket.inbound.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowSESToWriteInboundMail",
        Effect = "Allow",
        Principal = {
          Service = "ses.amazonaws.com"
        },
        Action   = "s3:PutObject",
        Resource = "${aws_s3_bucket.inbound.arn}/*",
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          },
          ArnLike = {
            "aws:SourceArn" = "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:receipt-rule-set/${local.receipt_rule_set_name}:receipt-rule/${local.receipt_rule_name}"
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic" "inbound" {
  name = "${var.resource_prefix}-inbound-${var.environment}"
}

resource "aws_sns_topic" "events" {
  name = "${var.resource_prefix}-events-${var.environment}"
}

resource "aws_sqs_queue" "inbound_dlq" {
  name                      = "${local.inbound_queue_name}-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "event_dlq" {
  name                      = "${local.event_queue_name}-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "inbound" {
  name                       = local.inbound_queue_name
  message_retention_seconds  = 345600
  visibility_timeout_seconds = max(var.lambda_timeout_seconds * 6, 180)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inbound_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue" "events" {
  name                       = local.event_queue_name
  message_retention_seconds  = 345600
  visibility_timeout_seconds = max(var.lambda_timeout_seconds * 6, 180)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_policy" "inbound" {
  queue_url = aws_sqs_queue.inbound.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowInboundTopicToSend",
        Effect = "Allow",
        Principal = {
          Service = "sns.amazonaws.com"
        },
        Action   = "sqs:SendMessage",
        Resource = aws_sqs_queue.inbound.arn,
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.inbound.arn
          }
        }
      }
    ]
  })
}

resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.events.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowEventTopicToSend",
        Effect = "Allow",
        Principal = {
          Service = "sns.amazonaws.com"
        },
        Action   = "sqs:SendMessage",
        Resource = aws_sqs_queue.events.arn,
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.events.arn
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "inbound_queue" {
  topic_arn = aws_sns_topic.inbound.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.inbound.arn
}

resource "aws_sns_topic_subscription" "event_queue" {
  topic_arn = aws_sns_topic.events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.events.arn
}

resource "aws_iam_role" "lambda" {
  name = local.lambda_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.resource_prefix}-lambda-${var.environment}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow",
        Action = [
          "sqs:ChangeMessageVisibility",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ReceiveMessage"
        ],
        Resource = [
          aws_sqs_queue.inbound.arn,
          aws_sqs_queue.events.arn
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject"
        ],
        Resource = "${aws_s3_bucket.inbound.arn}/*"
      }
    ]
  })
}

resource "aws_lambda_function" "inbound_adapter" {
  depends_on = [terraform_data.build_lambda_artifacts]

  function_name    = "${var.resource_prefix}-inbound-adapter-${var.environment}"
  filename         = "${path.module}/lambda-dist/inbound.zip"
  source_code_hash = local.inbound_lambda_hash
  role             = aws_iam_role.lambda.arn
  handler          = "inbound.handler"
  runtime          = "nodejs20.x"
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      WEBHOOK_SECRET     = var.ses_webhook_secret
      WEBHOOK_TIMEOUT_MS = tostring(var.webhook_timeout_ms)
      WEBHOOK_URL        = local.inbound_webhook_url
    }
  }
}

resource "aws_lambda_function" "event_adapter" {
  depends_on = [terraform_data.build_lambda_artifacts]

  function_name    = "${var.resource_prefix}-event-adapter-${var.environment}"
  filename         = "${path.module}/lambda-dist/events.zip"
  source_code_hash = local.event_lambda_hash
  role             = aws_iam_role.lambda.arn
  handler          = "events.handler"
  runtime          = "nodejs20.x"
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      WEBHOOK_SECRET     = var.ses_webhook_secret
      WEBHOOK_TIMEOUT_MS = tostring(var.webhook_timeout_ms)
      WEBHOOK_URL        = local.event_webhook_url
    }
  }
}

resource "aws_lambda_event_source_mapping" "inbound" {
  event_source_arn = aws_sqs_queue.inbound.arn
  function_name    = aws_lambda_function.inbound_adapter.arn
  batch_size       = 10
}

resource "aws_lambda_event_source_mapping" "events" {
  event_source_arn = aws_sqs_queue.events.arn
  function_name    = aws_lambda_function.event_adapter.arn
  batch_size       = 10
}

resource "aws_ses_domain_identity" "sender" {
  domain = var.sender_domain
}

resource "aws_ses_domain_dkim" "sender" {
  domain = aws_ses_domain_identity.sender.domain
}

resource "aws_ses_domain_mail_from" "sender" {
  domain           = aws_ses_domain_identity.sender.domain
  mail_from_domain = local.mail_from_domain
}

resource "aws_ses_configuration_set" "sender" {
  name = local.configuration_set_name
}

resource "aws_ses_event_destination" "sns" {
  name                   = "${var.resource_prefix}-${var.environment}"
  configuration_set_name = aws_ses_configuration_set.sender.name
  enabled                = true
  matching_types         = ["delivery", "bounce", "complaint", "reject", "renderingFailure"]

  sns_destination {
    topic_arn = aws_sns_topic.events.arn
  }
}

resource "aws_ses_receipt_rule_set" "inbound" {
  rule_set_name = local.receipt_rule_set_name
}

resource "aws_ses_receipt_rule" "store_inbound" {
  name          = local.receipt_rule_name
  rule_set_name = aws_ses_receipt_rule_set.inbound.rule_set_name
  enabled       = true
  recipients    = [var.inbound_domain]
  scan_enabled  = true
  tls_policy    = "Optional"

  s3_action {
    position          = 1
    bucket_name       = aws_s3_bucket.inbound.bucket
    object_key_prefix = "${var.environment}/incoming/"
    topic_arn         = aws_sns_topic.inbound.arn
  }

  depends_on = [
    aws_s3_bucket_policy.inbound
  ]
}

resource "aws_ses_active_receipt_rule_set" "inbound" {
  rule_set_name = aws_ses_receipt_rule_set.inbound.rule_set_name
}

resource "aws_iam_user" "sender" {
  name = local.sender_user_name
}

resource "aws_iam_user_policy" "sender" {
  name = "${var.resource_prefix}-sender-${var.environment}"
  user = aws_iam_user.sender.name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ],
        Resource = aws_ses_domain_identity.sender.arn
      }
    ]
  })
}

resource "aws_iam_access_key" "sender" {
  user = aws_iam_user.sender.name
}

resource "aws_route53_record" "ses_verification" {
  count   = local.create_dns ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "_amazonses.${var.sender_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["\"${aws_ses_domain_identity.sender.verification_token}\""]
}

resource "aws_route53_record" "ses_dkim" {
  for_each = local.create_dns ? toset(aws_ses_domain_dkim.sender.dkim_tokens) : toset([])

  zone_id = var.route53_zone_id
  name    = "${each.value}._domainkey.${var.sender_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${each.value}.dkim.amazonses.com"]
}

resource "aws_route53_record" "mail_from_mx" {
  count   = local.create_dns ? 1 : 0
  zone_id = var.route53_zone_id
  name    = local.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_txt" {
  count   = local.create_dns ? 1 : 0
  zone_id = var.route53_zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["\"v=spf1 include:amazonses.com ~all\""]
}

resource "aws_route53_record" "inbound_mx" {
  count   = local.create_dns ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.inbound_domain
  type    = "MX"
  ttl     = 600
  records = ["10 inbound-smtp.${var.aws_region}.amazonaws.com"]
}

resource "aws_ses_domain_identity_verification" "sender" {
  count  = local.create_dns ? 1 : 0
  domain = aws_ses_domain_identity.sender.domain

  depends_on = [
    aws_route53_record.ses_verification,
    aws_route53_record.ses_dkim,
    aws_route53_record.mail_from_mx,
    aws_route53_record.mail_from_txt
  ]
}

output "configuration_set_name" {
  description = "SES configuration set to inject into app env."
  value       = aws_ses_configuration_set.sender.name
}

output "dns_records" {
  description = "DNS records to create manually when Route53 automation is not used."
  value       = local.dns_records
}

output "inbound_bucket_name" {
  description = "Bucket where raw inbound email is stored."
  value       = aws_s3_bucket.inbound.bucket
}

output "lambda_webhook_urls" {
  description = "Webhook targets configured for the SES adapter Lambdas."
  value = {
    inbound = local.inbound_webhook_url
    events  = local.event_webhook_url
  }
}

output "runtime_env" {
  description = "Suggested app environment variables for enabling SES."
  sensitive   = true
  value = {
    EMAIL_TRANSPORT_PROVIDER    = "ses"
    EMAIL_RESEND_INBOUND_DOMAIN = var.resend_inbound_domain
    EMAIL_SES_INBOUND_DOMAIN    = var.inbound_domain
    SES_REGION                  = var.aws_region
    SES_ACCESS_KEY_ID           = aws_iam_access_key.sender.id
    SES_SECRET_ACCESS_KEY       = aws_iam_access_key.sender.secret
    SES_CONFIGURATION_SET       = aws_ses_configuration_set.sender.name
    SES_WEBHOOK_SECRET          = var.ses_webhook_secret
  }
}

output "sender_access_key_id" {
  description = "Access key id for the app sender IAM user."
  value       = aws_iam_access_key.sender.id
}

output "sender_secret_access_key" {
  description = "Secret access key for the app sender IAM user."
  value       = aws_iam_access_key.sender.secret
  sensitive   = true
}

output "sender_user_name" {
  description = "IAM user name created for app SES sending."
  value       = aws_iam_user.sender.name
}
