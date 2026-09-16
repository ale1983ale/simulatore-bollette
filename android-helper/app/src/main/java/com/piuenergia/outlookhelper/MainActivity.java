package com.piuenergia.outlookhelper;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.text.Html;
import android.util.Base64;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final int PICK_ZIP = 1001;
    private static final int PICK_LOGO = 1002;
    private static final String SIGNATURE_PLAIN =
            "Alessio Cedroni\n" +
            "Responsabile Commerciale\n" +
            "Mobile +39 347 040 2901\n" +
            "alessio.cedroni@piuenergia.it";

    private JSONObject manifest;
    private JSONArray recipients;
    private File packageDir;
    private int index = 0;
    private TextView status;
    private Button openButton;
    private Button previousButton;
    private String cachedLogoBase64;
    private ImageView logoPreview;

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

        TextView sigTitle = new TextView(this);
        sigTitle.setText("Firma aziendale preimpostata");
        sigTitle.setTextSize(18);
        sigTitle.setPadding(0, 0, 0, p / 2);
        root.addView(sigTitle);

        TextView sigPreview = new TextView(this);
        sigPreview.setText(Html.fromHtml(
                "<b><font color='#1f4e79'>Alessio Cedroni</font></b><br>" +
                "Responsabile Commerciale<br>" +
                "Mobile +39 347 040 2901<br>" +
                "<font color='#1f4e79'>alessio.cedroni@piuenergia.it</font>",
                Html.FROM_HTML_MODE_LEGACY));
        sigPreview.setPadding(0, 0, 0, p / 2);
        root.addView(sigPreview);

        logoPreview = new ImageView(this);
        logoPreview.setAdjustViewBounds(true);
        logoPreview.setMaxHeight((int) (180 * getResources().getDisplayMetrics().density));
        refreshLogoPreview();
        root.addView(logoPreview);

        Button logoButton = new Button(this);
        logoButton.setText("Scegli / modifica logo firma");
        logoButton.setOnClickListener(v -> pickLogo());
        root.addView(logoButton);

        TextView sigNote = new TextView(this);
        sigNote.setText("Il testo della firma è già impostato. Seleziona il banner/logo una sola volta: resterà salvato nell'app per le email successive.");
        sigNote.setPadding(0, p / 2, 0, p);
        root.addView(sigNote);

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
        note.setText("Flusso Android: apri la mail già compilata, controlla firma e allegato, premi Invia in Outlook, torna qui e apri la successiva.");
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

    private void pickLogo() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        startActivityForResult(intent, PICK_LOGO);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            try {
                if (requestCode == PICK_ZIP) {
                    loadPackage(data.getData());
                } else if (requestCode == PICK_LOGO) {
                    saveLogo(data.getData());
                }
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
        String json = new String(java.nio.file.Files.readAllBytes(manifestFile.toPath()), StandardCharsets.UTF_8);
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

            String plain = body + "\n\n" + SIGNATURE_PLAIN;
            String html = "<div style='font-family:Arial,sans-serif;font-size:11pt;'>" +
                    nl2br(Html.escapeHtml(body)) + "</div><br>" + buildSignatureHtml();

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

    private String buildSignatureHtml() {
        StringBuilder html = new StringBuilder();
        html.append("<div style='font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.35;color:#333333;'>")
                .append("<b style='color:#1f4e79;'>Alessio Cedroni</b><br>")
                .append("Responsabile Commerciale<br>")
                .append("Mobile <a href='tel:+393470402901' style='color:#1f4e79;text-decoration:none;'>+39 347 040 2901</a><br>")
                .append("<a href='mailto:alessio.cedroni@piuenergia.it' style='color:#1f4e79;text-decoration:none;'>alessio.cedroni@piuenergia.it</a>")
                .append("</div>");
        String logo = getLogoBase64();
        if (!logo.isEmpty()) {
            html.append("<br><img alt='+Energia' src='data:image/png;base64,")
                    .append(logo)
                    .append("' width='400' style='display:block;max-width:100%;height:auto;border:0;'>");
        }
        return html.toString();
    }

    private File getLogoFile() {
        return new File(getFilesDir(), "signature_logo");
    }

    private void saveLogo(Uri uri) throws Exception {
        File outFile = getLogoFile();
        try (InputStream in = getContentResolver().openInputStream(uri);
             FileOutputStream out = new FileOutputStream(outFile)) {
            if (in == null) throw new Exception("Impossibile leggere il logo");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        }
        cachedLogoBase64 = null;
        refreshLogoPreview();
        Toast.makeText(this, "Logo firma salvato", Toast.LENGTH_SHORT).show();
    }

    private void refreshLogoPreview() {
        if (logoPreview == null) return;
        File file = getLogoFile();
        if (!file.exists()) {
            logoPreview.setImageDrawable(null);
            return;
        }
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
        logoPreview.setImageBitmap(bitmap);
    }

    private String getLogoBase64() {
        if (cachedLogoBase64 != null) return cachedLogoBase64;
        File file = getLogoFile();
        if (!file.exists()) return cachedLogoBase64 = "";
        try (InputStream in = new java.io.FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            cachedLogoBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            cachedLogoBase64 = "";
        }
        return cachedLogoBase64;
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
