package it.piuenergia.simulatore;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 7001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(255, 122, 0));
        getWindow().setNavigationBarColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(
            settings.getUserAgentString() + " SimulatoreBolletteAndroid/1.0"
        );

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new ContactsBridge(), "AndroidContacts");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                if (
                    "http".equalsIgnoreCase(scheme) ||
                    "https".equalsIgnoreCase(scheme)
                ) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }

                MainActivity.this.filePathCallback = filePathCallback;

                Intent chooserIntent;
                try {
                    chooserIntent = fileChooserParams.createIntent();
                } catch (Exception error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }

                try {
                    startActivityForResult(
                        chooserIntent,
                        FILE_CHOOSER_REQUEST
                    );
                    return true;
                } catch (Exception error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean bridgeAllowed() {
        String currentUrl = webView == null ? null : webView.getUrl();
        if (currentUrl == null) return false;

        try {
            Uri uri = Uri.parse(currentUrl);
            String host = uri.getHost();
            String appHost = Uri.parse(BuildConfig.APP_URL).getHost();

            return host != null &&
                appHost != null &&
                host.equalsIgnoreCase(appHost);
        } catch (Exception error) {
            return false;
        }
    }

    private class ContactsBridge {
        @JavascriptInterface
        public void addContact(String payload) {
            if (!bridgeAllowed()) return;

            runOnUiThread(() -> {
                try {
                    JSONObject json = new JSONObject(payload);
                    String name = json.optString("name", "");
                    String phone = json.optString("phone", "");
                    String email = json.optString("email", "");
                    String company = json.optString("company", "");

                    Intent intent = new Intent(
                        ContactsContract.Intents.Insert.ACTION
                    );
                    intent.setType(
                        ContactsContract.RawContacts.CONTENT_TYPE
                    );

                    if (!name.isEmpty()) {
                        intent.putExtra(
                            ContactsContract.Intents.Insert.NAME,
                            name
                        );
                    }

                    if (!phone.isEmpty()) {
                        intent.putExtra(
                            ContactsContract.Intents.Insert.PHONE,
                            phone
                        );
                        intent.putExtra(
                            ContactsContract.Intents.Insert.PHONE_TYPE,
                            ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                        );
                    }

                    if (!email.isEmpty()) {
                        intent.putExtra(
                            ContactsContract.Intents.Insert.EMAIL,
                            email
                        );
                        intent.putExtra(
                            ContactsContract.Intents.Insert.EMAIL_TYPE,
                            ContactsContract.CommonDataKinds.Email.TYPE_WORK
                        );
                    }

                    if (!company.isEmpty()) {
                        intent.putExtra(
                            ContactsContract.Intents.Insert.COMPANY,
                            company
                        );
                    }

                    startActivity(intent);
                } catch (Exception error) {
                    error.printStackTrace();
                }
            });
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(
        int requestCode,
        int resultCode,
        Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (
            requestCode == FILE_CHOOSER_REQUEST &&
            filePathCallback != null
        ) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(
                resultCode,
                data
            );
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
