import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type RawEmailLocation = {
	bucketName: string;
	objectKey: string;
};

let s3Client: S3Client | null = null;

function getS3Client() {
	if (!s3Client) {
		s3Client = new S3Client({});
	}

	return s3Client;
}

export async function fetchRawEmail(location: RawEmailLocation) {
	const response = await getS3Client().send(
		new GetObjectCommand({
			Bucket: location.bucketName,
			Key: location.objectKey,
		})
	);

	if (!response.Body) {
		throw new Error("SES inbound S3 object had no body");
	}

	return await response.Body.transformToByteArray();
}
