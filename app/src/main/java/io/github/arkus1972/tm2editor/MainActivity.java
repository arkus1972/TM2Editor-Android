package io.github.arkus1972.tm2editor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Opakowanie: cała aplikacja to app/src/main/assets/index.html w WebView.
 *
 * Java robi tylko to, czego strona sama nie umie na Androidzie:
 *  - otwiera plik systemowym wyborem pliku (karta SD w czytniku USB-C,
 *    pamięć telefonu, Dysk Google…) i podaje bajty stronie,
 *  - zapisuje NOWY plik w miejscu wskazanym przez użytkownika
 *    (ACTION_CREATE_DOCUMENT nigdy nie nadpisuje istniejącego pliku),
 *  - pyta przed wyjściem, gdy są niezapisane zmiany.
 *
 * Żadnych uprawnień, żadnego internetu — w manifeście nie ma INTERNET.
 */
public class MainActivity extends Activity {

    private static final int KOD_OTWORZ = 1;
    private static final int KOD_ZAPISZ = 2;
    /** Backup ma 124 748 B; większy plik na pewno nim nie jest. */
    private static final int MAKS_ROZMIAR = 4 * 1024 * 1024;

    private WebView web;
    private byte[] doZapisu;

    @Override
    protected void onCreate(Bundle stan) {
        super.onCreate(stan);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0e0e11"));
        WebSettings ustawienia = web.getSettings();
        ustawienia.setJavaScriptEnabled(true);
        ustawienia.setDomStorageEnabled(true);          // zapamiętana zakładka
        ustawienia.setAllowFileAccess(false);           // assets działają i bez tego
        ustawienia.setAllowContentAccess(false);
        ustawienia.setTextZoom(100);                    // układ liczony na stałe czcionki
        web.addJavascriptInterface(new Most(), "TM2Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return true;                            // strona nigdzie nie wychodzi
            }
        });

        // Od Androida 15 aplikacja rysuje się pod paskami systemu — odsuwamy
        // stronę o paski i o klawiaturę, żeby pole tekstowe nie znikało pod nią.
        FrameLayout korzen = new FrameLayout(this);
        korzen.setBackgroundColor(Color.parseColor("#0e0e11"));
        korzen.addView(web);
        korzen.setOnApplyWindowInsetsListener((v, wciecia) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = wciecia.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(wciecia.getSystemWindowInsetLeft(), wciecia.getSystemWindowInsetTop(),
                        wciecia.getSystemWindowInsetRight(), wciecia.getSystemWindowInsetBottom());
            }
            return wciecia;
        });
        setContentView(korzen);

        if (stan != null) web.restoreState(stan);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle stan) {
        super.onSaveInstanceState(stan);
        web.saveState(stan);
    }

    /** Metody wołane ze strony: window.TM2Android.otworzPlik() itd. */
    private class Most {
        @JavascriptInterface
        public void otworzPlik() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");                       // .TM0 nie ma swojego typu MIME
                startActivityForResult(i, KOD_OTWORZ);
            });
        }

        @JavascriptInterface
        public void zapiszPlik(String nazwa, String base64) {
            final byte[] bajty;
            try {
                bajty = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                wyslij("tm2PlikZapisany(false, " + JSONObject.quote("bad data") + ")");
                return;
            }
            runOnUiThread(() -> {
                doZapisu = bajty;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/octet-stream");
                i.putExtra(Intent.EXTRA_TITLE, nazwa);
                startActivityForResult(i, KOD_ZAPISZ);
            });
        }
    }

    @Override
    protected void onActivityResult(int kod, int wynik, Intent dane) {
        super.onActivityResult(kod, wynik, dane);
        Uri uri = (wynik == RESULT_OK && dane != null) ? dane.getData() : null;
        if (kod == KOD_OTWORZ) {
            if (uri != null) otworz(uri);
        } else if (kod == KOD_ZAPISZ) {
            byte[] bajty = doZapisu;
            doZapisu = null;
            if (uri != null && bajty != null) zapisz(uri, bajty);
        }
    }

    private void otworz(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("cannot read the file");
            ByteArrayOutputStream bufor = new ByteArrayOutputStream();
            byte[] kawalek = new byte[16384];
            int n;
            while ((n = in.read(kawalek)) > 0) {
                bufor.write(kawalek, 0, n);
                if (bufor.size() > MAKS_ROZMIAR) throw new IllegalStateException("the file is too large to be a TM-2 backup");
            }
            String b64 = Base64.encodeToString(bufor.toByteArray(), Base64.NO_WRAP);
            wyslij("tm2PlikOtwarty('" + b64 + "', " + JSONObject.quote(nazwa(uri)) + ")");
        } catch (Exception e) {
            wyslij("tm2Blad(" + JSONObject.quote("Cannot open the file: " + e.getMessage()) + ")");
        }
    }

    private void zapisz(Uri uri, byte[] bajty) {
        try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
            if (out == null) throw new IllegalStateException("cannot write the file");
            out.write(bajty);
            out.flush();
            wyslij("tm2PlikZapisany(true, " + JSONObject.quote(nazwa(uri)) + ")");
        } catch (Exception e) {
            wyslij("tm2PlikZapisany(false, " + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
        }
    }

    private String nazwa(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } catch (Exception ignored) {
            // nazwa jest tylko do pokazania
        }
        String s = uri.getLastPathSegment();
        return s != null ? s : "BKUP.TM0";
    }

    private void wyslij(String js) {
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("tm2MaNiezapisane()", odp -> {
            if ("true".equals(odp)) {
                new AlertDialog.Builder(this)
                        .setTitle("Discard changes?")
                        .setMessage("This backup has changes that are not saved yet.")
                        .setPositiveButton("Discard", (d, w) -> finish())
                        .setNegativeButton("Cancel", null)
                        .show();
            } else {
                finish();
            }
        });
    }
}
