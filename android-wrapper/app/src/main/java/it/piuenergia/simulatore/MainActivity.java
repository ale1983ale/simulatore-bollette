package it.piuenergia.simulatore;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

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
            settings.getUserAgentString() + " GestioneEnergiaAndroid/1.0.4"
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

    private void applyContactExtras(
        Intent intent,
        String name,
        String phone,
        String email,
        String company
    ) {
        if (!name.isEmpty()) {
            intent.putExtra(ContactsContract.Intents.Insert.NAME, name);
        }

        if (!phone.isEmpty()) {
            intent.putExtra(ContactsContract.Intents.Insert.PHONE, phone);
            intent.putExtra(
                ContactsContract.Intents.Insert.PHONE_TYPE,
                ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
            );
        }

        if (!email.isEmpty()) {
            intent.putExtra(ContactsContract.Intents.Insert.EMAIL, email);
            intent.putExtra(
                ContactsContract.Intents.Insert.EMAIL_TYPE,
                ContactsContract.CommonDataKinds.Email.TYPE_WORK
            );
        }

        if (!company.isEmpty()) {
            intent.putExtra(ContactsContract.Intents.Insert.COMPANY, company);
        }
    }

    private boolean launchContactEditor(
        String name,
        String phone,
        String email,
        String company
    ) {
        try {
            Intent insertIntent = new Intent(
                Intent.ACTION_INSERT,
                ContactsContract.Contacts.CONTENT_URI
            );
            applyContactExtras(
                insertIntent,
                name,
                phone,
                email,
                company
            );
            startActivity(insertIntent);
            return true;
        } catch (Exception primaryError) {
            try {
                Intent fallbackIntent = new Intent(
                    Intent.ACTION_INSERT_OR_EDIT
                );
                fallbackIntent.setType(
                    ContactsContract.Contacts.CONTENT_ITEM_TYPE
                );
                applyContactExtras(
                    fallbackIntent,
                    name,
                    phone,
                    email,
                    company
                );
                startActivity(fallbackIntent);
                return true;
            } catch (Exception fallbackError) {
                fallbackError.printStackTrace();
                return false;
            }
        }
    }

    private class ContactsBridge {
        @JavascriptInterface
        public void addContact(String payload) {
            runOnUiThread(() -> {
                if (!bridgeAllowed()) {
                    Toast.makeText(
                        MainActivity.this,
                        "Impossibile aprire la Rubrica da questa pagina.",
                        Toast.LENGTH_LONG
                    ).show();
                    return;
                }

                try {
                    JSONObject json = new JSONObject(payload);
                    String name = json.optString("name", "").trim();
                    String phone = json.optString("phone", "").trim();
                    String email = json.optString("email", "").trim();
                    String company = json.optString("company", "").trim();

                    boolean opened = launchContactEditor(
                        name,
                        phone,
                        email,
                        company
                    );

                    if (!opened) {
                        Toast.makeText(
                            MainActivity.this,
                            "Android non ha trovato un'app Rubrica compatibile.",
                            Toast.LENGTH_LONG
                        ).show();
                    }
                } catch (Exception error) {
                    error.printStackTrace();
                    Toast.makeText(
                        MainActivity.this,
                        "Errore nell'apertura della Rubrica.",
                        Toast.LENGTH_LONG
                    ).show();
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
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
            "(function(){" +
                "try{" +
                    "var s=window.history.state||{};" +
                    "var d=Number(s.geDepth||0);" +
                    "if(d>0){window.history.back();return true;}" +
                    "return false;" +
                "}catch(e){return false;}" +
            "})()",
            result -> {
                if ("true".equals(result)) {
                    return;
                }

                if (!bridgeAllowed() && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                MainActivity.super.onBackPressed();
            }
        );
    }
}
