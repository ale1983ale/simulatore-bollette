package it.piuenergia.simulatore;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceError;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import android.util.Base64;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private WebView webView;
    private boolean pageLoaded = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7002;

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
            settings.getUserAgentString() + " GestioneEnergiaAndroid/1.0.8"
        );

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new ContactsBridge(), "AndroidContacts");
        webView.addJavascriptInterface(new PdfBridge(), "AndroidFiles");
        webView.addJavascriptInterface(new ReminderBridge(), "AndroidReminders");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "Errore caricamento: " + error.getDescription(), Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                if ("https".equalsIgnoreCase(scheme) &&
                    "/Outlook-Invio-Android.apk".equals(uri.getPath()) &&
                    Uri.parse(BuildConfig.APP_URL).getHost().equalsIgnoreCase(uri.getHost())) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(intent);
                    } catch (Exception error) {
                        Toast.makeText(MainActivity.this, "Apri il link APK in Chrome.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                String host = uri.getHost();
                if ("geo".equalsIgnoreCase(scheme) ||
                    ("https".equalsIgnoreCase(scheme) && host != null &&
                     (host.equalsIgnoreCase("maps.google.com") ||
                      host.equalsIgnoreCase("www.google.com") && uri.getPath() != null &&
                          uri.getPath().startsWith("/maps") ||
                      host.equalsIgnoreCase("www.google.com") && "/url".equals(uri.getPath()) ||
                      host.equalsIgnoreCase("maps.app.goo.gl") ||
                      host.equalsIgnoreCase("goo.gl") && uri.getPath() != null &&
                          uri.getPath().startsWith("/maps")))) {
                    try {
                        Intent mapIntent = new Intent(Intent.ACTION_VIEW, uri);
                        mapIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(mapIntent);
                    } catch (Exception error) {
                        Toast.makeText(MainActivity.this, "Impossibile aprire Google Maps.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
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

        // Avoid restoring a stale renderer state that can show a blank page.
        webView.loadUrl(BuildConfig.APP_URL);
        mainHandler.postDelayed(() -> {
            if (!pageLoaded && webView != null) {
                Toast.makeText(MainActivity.this, "Caricamento lento: riprovo...", Toast.LENGTH_LONG).show();
                webView.reload();
            }
        }, 12000);
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
        String givenName,
        String familyName,
        String phone,
        String email,
        String company
    ) {
        if (!name.isEmpty()) {
            intent.putExtra(ContactsContract.Intents.Insert.NAME, name);
        }
        // Passa i nomi come campi strutturati, non affidarti alla
        // separazione automatica del nome completo nella rubrica Android.
        if (!givenName.isEmpty() || !familyName.isEmpty()) {
            ArrayList<ContentValues> rows = new ArrayList<>();
            ContentValues structuredName = new ContentValues();
            structuredName.put(
                ContactsContract.Data.MIMETYPE,
                ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
            );
            structuredName.put(
                ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME,
                givenName
            );
            structuredName.put(
                ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME,
                familyName
            );
            rows.add(structuredName);
            intent.putParcelableArrayListExtra(
                ContactsContract.Intents.Insert.DATA,
                rows
            );
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
        String givenName,
        String familyName,
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
                givenName,
                familyName,
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
                    givenName,
                    familyName,
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

    private Uri savePdfFile(String base64Data, String fileName)
        throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return null;
        }

        String safeName = fileName == null
            ? "Preventivo.pdf"
            : fileName.replaceAll("[\\\\/:*?\"<>|]", "").trim();

        if (safeName.isEmpty()) {
            safeName = "Preventivo.pdf";
        }

        if (!safeName.toLowerCase().endsWith(".pdf")) {
            safeName += ".pdf";
        }

        byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
        values.put(
            MediaStore.Downloads.RELATIVE_PATH,
            Environment.DIRECTORY_DOWNLOADS + "/Gestione Energia"
        );
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = getContentResolver().insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            values
        );

        if (uri == null) {
            return null;
        }

        try (OutputStream output =
            getContentResolver().openOutputStream(uri)) {
            if (output == null) {
                getContentResolver().delete(uri, null, null);
                return null;
            }
            output.write(bytes);
            output.flush();
        } catch (Exception error) {
            getContentResolver().delete(uri, null, null);
            throw error;
        }

        ContentValues complete = new ContentValues();
        complete.put(MediaStore.Downloads.IS_PENDING, 0);
        getContentResolver().update(uri, complete, null, null);

        return uri;
    }

    private void openPdfExternally(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/pdf");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            startActivity(
                Intent.createChooser(intent, "Apri PDF")
            );
        } catch (Exception error) {
            Toast.makeText(
                MainActivity.this,
                "PDF salvato in Download/Gestione Energia.",
                Toast.LENGTH_LONG
            ).show();
        }
    }


    private Uri saveZipFile(String base64Data, String fileName)
        throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return null;
        }

        String safeName = fileName == null
            ? "Pacchetto-Android.zip"
            : fileName.replaceAll("[\\\\/:*?\"<>|]", "").trim();
        if (safeName.isEmpty()) safeName = "Pacchetto-Android.zip";
        if (!safeName.toLowerCase().endsWith(".zip")) safeName += ".zip";

        byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/zip");
        values.put(
            MediaStore.Downloads.RELATIVE_PATH,
            Environment.DIRECTORY_DOWNLOADS + "/Gestione Energia"
        );
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = getContentResolver().insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
        );
        if (uri == null) return null;

        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new Exception("Impossibile aprire il download");
            output.write(bytes);
            output.flush();
        } catch (Exception error) {
            getContentResolver().delete(uri, null, null);
            throw error;
        }
        ContentValues complete = new ContentValues();
        complete.put(MediaStore.Downloads.IS_PENDING, 0);
        getContentResolver().update(uri, complete, null, null);
        return uri;
    }

    private class PdfBridge {
        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                if (!bridgeAllowed()) {
                    Toast.makeText(MainActivity.this, "Collegamento non autorizzato.", Toast.LENGTH_LONG).show();
                    return;
                }
                try {
                    Uri target = Uri.parse(url);
                    Uri appUrl = Uri.parse(BuildConfig.APP_URL);
                    if (!"https".equalsIgnoreCase(target.getScheme()) ||
                        !appUrl.getHost().equalsIgnoreCase(target.getHost()) ||
                        !"/Outlook-Invio-Android.apk".equals(target.getPath())) {
                        throw new Exception("Indirizzo non consentito");
                    }
                    Intent intent = new Intent(Intent.ACTION_VIEW, target);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "Non riesco ad aprire il download. Usa Chrome.", Toast.LENGTH_LONG).show();
                }
            });
        }


        @JavascriptInterface
        public void saveZip(String base64Data, String fileName) {
            runOnUiThread(() -> {
                if (!bridgeAllowed()) {
                    Toast.makeText(
                        MainActivity.this,
                        "Download ZIP non consentito da questa pagina.",
                        Toast.LENGTH_LONG
                    ).show();
                    return;
                }
                new Thread(() -> {
                    try {
                        Uri uri = saveZipFile(base64Data, fileName);
                        runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            uri == null
                                ? "Download ZIP supportato da Android 10 in poi."
                                : "ZIP salvato in Download/Gestione Energia.",
                            Toast.LENGTH_LONG
                        ).show());
                    } catch (Exception error) {
                        error.printStackTrace();
                        runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Errore nel salvataggio ZIP.",
                            Toast.LENGTH_LONG
                        ).show());
                    }
                }).start();
            });
        }
        @JavascriptInterface
        public void savePdf(String base64Data, String fileName) {
            runOnUiThread(() -> {
                if (!bridgeAllowed()) {
                    Toast.makeText(
                        MainActivity.this,
                        "Impossibile salvare il PDF da questa pagina.",
                        Toast.LENGTH_LONG
                    ).show();
                    return;
                }

                new Thread(() -> {
                    try {
                        Uri uri = savePdfFile(base64Data, fileName);

                        runOnUiThread(() -> {
                            if (uri == null) {
                                Toast.makeText(
                                    MainActivity.this,
                                    "Salvataggio PDF supportato da Android 10 in poi.",
                                    Toast.LENGTH_LONG
                                ).show();
                                return;
                            }

                            openPdfExternally(uri);
                        });
                    } catch (Exception error) {
                        error.printStackTrace();
                        runOnUiThread(() ->
                            Toast.makeText(
                                MainActivity.this,
                                "Errore nel salvataggio del PDF.",
                                Toast.LENGTH_LONG
                            ).show()
                        );
                    }
                }).start();
            });
        }
    }


    private class ReminderBridge {
        @JavascriptInterface public boolean schedule(String id, String title, String detail, long triggerAtMillis) {
            if (!bridgeAllowed() || id == null || id.isEmpty() || triggerAtMillis <= System.currentTimeMillis()) return false;
            try {
                Intent intent = new Intent(MainActivity.this, ReminderReceiver.class);
                intent.putExtra("id", id);
                intent.putExtra("title", title);
                intent.putExtra("detail", detail);
                PendingIntent pending = PendingIntent.getBroadcast(MainActivity.this, id.hashCode(), intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending);
                return true;
            } catch (Exception error) { return false; }
        }

        @JavascriptInterface public boolean cancel(String id) {
            if (!bridgeAllowed() || id == null || id.isEmpty()) return false;
            Intent intent = new Intent(MainActivity.this, ReminderReceiver.class);
            PendingIntent pending = PendingIntent.getBroadcast(MainActivity.this, id.hashCode(), intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pending != null) {
                ((AlarmManager) getSystemService(Context.ALARM_SERVICE)).cancel(pending);
                pending.cancel();
            }
            return true;
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
                    String givenName = json.optString("givenName", "").trim();
                    String familyName = json.optString("familyName", "").trim();
                    String phone = json.optString("phone", "").trim();
                    String email = json.optString("email", "").trim();
                    String company = json.optString("company", "").trim();

                    boolean opened = launchContactEditor(
                        name,
                        givenName,
                        familyName,
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
