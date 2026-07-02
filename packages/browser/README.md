# Cossistant Browser Runtime

`@cossistant/browser` is the browser embed layer for the Cossistant support
widget.

It stays intentionally thin:
- `@cossistant/core` owns the runtime controller
- `@cossistant/react` remains the single widget authoring surface
- the embed bundle aliases React to Preact compat for smaller CDN assets

That means browser stays in lockstep with React by construction. When the React
widget changes, the browser widget updates on the next browser build and
release.

## Package surfaces

- Library/runtime entry:
  - `mountSupportWidget()`
- CDN embed build:
  - `loader.js`
  - `widget.js`
  - `widget.css`

## Browser embed characteristics

- mounts into a `ShadowRoot` by default
- injects `widget.css` into the shadow tree only
- preserves `--co-*` and `--co-theme-*` custom-property theming
- exposes `window.Cossistant.init()`, `show()`, `hide()`, `toggle()`,
  `identify()`, `updateConfig()`, `destroy()`, `on()`, and `off()`

## CDN usage

Add a single script tag with your public key — anywhere in `<head>` or
`<body>`; the widget waits for the DOM before mounting:

```html
<script
  async
  src="https://cdn.cossistant.com/widget/latest/loader.js"
  data-public-key="pk_live_..."
></script>
```

The loader reads `data-public-key` from its own script tag and initializes the
widget automatically once `widget.js` loads. Self-hosted deployments can also
set `data-api-url` and `data-ws-url`:

```html
<script
  async
  src="https://cdn.your-domain.com/widget/latest/loader.js"
  data-public-key="pk_live_..."
  data-api-url="https://api.your-domain.com"
  data-ws-url="wss://api.your-domain.com/ws"
></script>
```

The loader derives `widget.js` and `widget.css` from its own URL, so the
versioned form works the same way:

```html
<script
  async
  src="https://cdn.cossistant.com/widget/0.1.2/loader.js"
  data-public-key="pk_live_..."
></script>
```

### Calling the API before the widget loads

`window.Cossistant` only exists once `loader.js` executes, and the script tag
above is `async`. Inline scripts that need to call widget methods earlier must
install a small command queue first; every queued call is replayed (in order,
after any `data-public-key` auto-init) once the widget runtime loads:

```html
<script>
  (function (w) {
    var c = (w.Cossistant = w.Cossistant || { __queue: [] });
    var methods =
      "init show hide toggle identify updateConfig destroy on off".split(" ");
    for (var i = 0; i < methods.length; i++) {
      (function (m) {
        c[m] =
          c[m] ||
          function () {
            c.__queue.push({ method: m, args: [].slice.call(arguments) });
          };
      })(methods[i]);
    }
  })(window);
</script>
<script async src="https://cdn.cossistant.com/widget/latest/loader.js"></script>
<script>
  window.Cossistant.init({
    publicKey: "pk_live_..."
  });
  window.Cossistant.show();
</script>
```

With `data-public-key` on the loader tag you never need to call `init()`
yourself — the queue stub is only required when calling widget methods before
the bundle has loaded.

## Release model

- `@cossistant/browser` is in the same Changesets fixed-version group as
  `@cossistant/core` and `@cossistant/react`
- GitHub Actions builds and uploads versioned embed assets to S3 + CloudFront
- the release workflow reuses the shared infra variables already used by app
  uploads:
  - `S3_REGION`
  - `S3_BUCKET_NAME`
  - `S3_CDN_BASE_URL`
  - `AWS_ROLE_ARN`
  - `CLOUDFRONT_DISTRIBUTION_ID`
- immutable versioned assets and a `latest/` alias are both published
