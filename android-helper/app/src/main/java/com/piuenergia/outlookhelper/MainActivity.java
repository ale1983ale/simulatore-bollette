package com.piuenergia.outlookhelper;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Html;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final int PICK_ZIP = 1001;
    private JSONObject manifest;
    private JSONArray recipients;
    private File packageDir;
    private int index = 0;
    private TextView status;
    private EditText signature;
    private EditText logoUrl;
    private Button openButton;
    private Button previousButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
    }

    private void buildUi() {
        int p = (int) (16 * getResources().getDisplayMetrics().density);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(p, p, p, p);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Invio Email Agenti");
        title.setTextSize(24);
        title.setPadding(0, 0, 0, p);
        root.addView(title);

        Button select = new Button(this);
        select.setText("1. Seleziona pacchetto ZIP");
        select.setOnClickListener(v -> pickZip());
        root.addView(select);

        status = new TextView(this);
        status.setText("Nessun pacchetto caricato.");
        status.setPadding(0, p, 0, p);
        root.addView(status);

        TextView sigLabel = new TextView(this);
        sigLabel.setText("Firma automatica (testo)");
        root.addView(sigLabel);

        signature = new EditText(this);
        signature.setMinLines(3);
        signature.setHint("Es. Alessio Cedroni\nResponsabile Commerciale\n+Energia S.p.A.");
        root.addView(signature);

        TextView logoLabel = new TextView(this);
        logoLabel.setText("URL logo aziendale (facoltativo)");
        logoLabel.setPadding(0, p / 2, 0, 0);
        root.addView(logoLabel);

        logoUrl = new EditText(this);
        logoUrl.setHint("https://.../logo.png");
        root.addView(logoUrl);

        SharedPreferences prefs = getSharedPreferences("settings", MODE_PRIVATE);
        signature.setText(prefs.getString("signature", ""));
        logoUrl.setText(prefs.getString("logoUrl", ""));

        Button save = new Button(this);
        save.setText("Salva firma");
        save.setOnClickListener(v -> {
            prefs.edit().putString("signature", signature.getText().toString())
                    .putString("logoUrl", logoUrl.getText().toString().trim()).apply();
            Toast.makeText(this, "Firma salvata", Toast.LENGTH_SHORT).show();
        });
        root.addView(save);

        openButton = new Button(this);
        openButton.setText("2. Apri email corrente in Outlook");
        openButton.setEnabled(false);
        openButton.setOnClickListener(v -> openCurrent());
        root.addView(openButton);

        previousButton = new Button(this);
        previousButton.setText("Torna all'email precedente");
        previousButton.setEnabled(false);
        previousButton.setOnClickListener(v -> {
            if (index > 0) index--;
            updateStatus();
        });
        root.addView(previousButton);

        TextView note = new TextView(this);
        note.setText("Flusso Android: apri la mail già compilata, premi Invia in Outlook, torna qui e apri la successiva. Il logo viene tentato come immagine HTML remota: Outlook mobile può eventualmente rimuoverlo.");
        note.setPadding(0, p, 0, 0);
        root.addView(note);

        setContentView(scroll);
    }

    private void pickZip() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        startActivityForResult(intent, PICK_ZIP);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_ZIP && resultCode == RESULT_OK && data != null && data.getData() != null) {
            try {
                loadPackage(data.getData());
            } catch (Exception e) {
                Toast.makeText(this, "Errore: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    private void loadPackage(Uri uri) throws Exception {
        packageDir = new File(getCacheDir(), "mailpkg");
        deleteRecursive(packageDir);
        if (!packageDir.mkdirs() && !packageDir.isDirectory()) throw new Exception("Impossibile creare la cartella temporanea");

        try (InputStream in = getContentResolver().openInputStream(uri); ZipInputStream zis = new ZipInputStream(in)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File out = new File(packageDir, entry.getName());
                String root = packageDir.getCanonicalPath() + File.separator;
                if (!out.getCanonicalPath().startsWith(root)) throw new Exception("ZIP non valido");
                if (entry.isDirectory()) {
                    out.mkdirs();
                } else {
                    File parent = out.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        int n;
                        while ((n = zis.read(buffer)) > 0) fos.write(buffer, 0, n);
                    }
                }
                zis.closeEntry();
            }
        }

        File manifestFile = new File(packageDir, "manifest.json");
        if (!manifestFile.exists()) throw new Exception("manifest.json non trovato nel pacchetto");
        String json = new String(java.nio.file.Files.readAllBytes(manifestFile.toPath()), java.nio.charset.StandardCharsets.UTF_8);
        manifest = new JSONObject(json);
        recipients = manifest.getJSONArray("recipients");
        index = 0;
        openButton.setEnabled(recipients.length() > 0);
        updateStatus();
    }

    private void updateStatus() {
        if (recipients == null || recipients.length() == 0) {
            status.setText("Nessuna email nel pacchetto.");
            openButton.setEnabled(false);
            previousButton.setEnabled(false);
            return;
        }
        if (index >= recipients.length()) {
            status.setText("Completato: hai aperto tutte le " + recipients.length() + " email. Se ne hai saltata una, usa il tasto precedente.");
            openButton.setText("Tutte le email aperte");
            openButton.setEnabled(false);
        } else {
            JSONObject r = recipients.optJSONObject(index);
            String email = r != null ? r.optString("email", "") : "";
            String agency = r != null ? r.optString("agency", "") : "";
            status.setText("Email " + (index + 1) + " di " + recipients.length() + "\n" + agency + "\n" + email);
            openButton.setText("Apri email " + (index + 1) + "/" + recipients.length() + " in Outlook");
            openButton.setEnabled(true);
        }
        previousButton.setEnabled(index > 0);
    }

    private void openCurrent() {
        try {
            if (recipients == null || index >= recipients.length()) return;
            JSONObject r = recipients.getJSONObject(index);
            String email = r.optString("email", "");
            String subject = manifest.optString("subject", "");
            String body = manifest.optString("body", "");
            String sig = signature.getText().toString().trim();
            String logo = logoUrl.getText().toString().trim();

            String plain = body + (sig.isEmpty() ? "" : "\n\n" + sig);
            String html = "<div style='font-family:Arial,sans-serif;font-size:11pt;'>" + nl2br(Html.escapeHtml(body)) + "</div>";
            if (!sig.isEmpty()) html += "<br><div style='font-family:Arial,sans-serif;font-size:10.5pt;'>" + nl2br(Html.escapeHtml(sig)) + "</div>";
            if (!logo.isEmpty()) html += "<br><img src='" + Html.escapeHtml(logo) + "' style='max-width:220px;height:auto;'>";

            JSONArray att = r.optJSONArray("attachments");
            ArrayList<Uri> uris = new ArrayList<>();
            if (att != null) {
                for (int i = 0; i < att.length(); i++) {
                    File f = new File(packageDir, att.getString(i));
                    if (!f.exists()) throw new Exception("Allegato non trovato: " + f.getName());
                    uris.add(FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f));
                }
            }

            Intent intent = new Intent(uris.size() > 1 ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
            intent.setType("application/octet-stream");
            intent.putExtra(Intent.EXTRA_EMAIL, new String[]{email});
            intent.putExtra(Intent.EXTRA_SUBJECT, subject);
            intent.putExtra(Intent.EXTRA_TEXT, plain);
            intent.putExtra(Intent.EXTRA_HTML_TEXT, html);
            if (uris.size() == 1) intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            if (uris.size() > 1) intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            try {
                getPackageManager().getPackageInfo("com.microsoft.office.outlook", 0);
                intent.setPackage("com.microsoft.office.outlook");
                startActivity(intent);
            } catch (Exception ignored) {
                startActivity(Intent.createChooser(intent, "Apri con Outlook"));
            }

            index++;
            updateStatus();
        } catch (Exception e) {
            Toast.makeText(this, "Errore: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private String nl2br(String value) {
        return value.replace("\r\n", "<br>").replace("\n", "<br>").replace("\r", "<br>");
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        file.delete();
    }
}
