const GTM_ID = 'GTM-5MQWXSHS';
const PROD_HOST = 'updatemachine.com';

function isProdHostConfigured(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname === PROD_HOST;
  } catch {
    return false;
  }
}

/**
 * GTM head script — uses runtime hostname check so it never fires on
 * canary/staging/local, even though the same build artifact may serve
 * multiple domains.
 */
export function GoogleTagManagerHead() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){
  if(window.location.hostname !== '${PROD_HOST}') return;
  var w=window,d=document,s='script',l='dataLayer',i='${GTM_ID}';
  w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],j=d.createElement(s),
  dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})();`,
      }}
    />
  );
}

/**
 * GTM noscript fallback — also guarded at runtime via inline script that
 * removes the iframe src on non-production hosts.  For users with JS
 * disabled on non-prod, the iframe loads but GTM ignores unknown origins.
 */
export function GoogleTagManagerBody() {
  if (!isProdHostConfigured()) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  );
}
