# TM2Editor — Android

Edytor plików BACKUP Rolanda TM-2 na telefon i tablet z Androidem.
Darmowy, otwarty (MIT), działa bez internetu i niczego nie wysyła.

Wersja na Maca to **osobny projekt**: [github.com/arkus1972/TM2Editor](https://github.com/arkus1972/TM2Editor).
Wiedza o formacie pliku (adresy, efekty, typy padów, brzmienia) jest
przeniesiona stamtąd 1:1 — tam są też pomiary i dziennik mapowania.

## Jak to jest zbudowane

Cała aplikacja to **jeden plik**: `app/src/main/assets/index.html`
(wygląd, rdzeń formatu i interfejs). Android tylko go wyświetla w WebView
— tak samo jak Pulsometron.

| Plik | Co robi |
|---|---|
| `app/src/main/assets/index.html` | aplikacja; `<script id="tm2-rdzen">` = format pliku, `<script id="tm2-interfejs">` = ekran |
| `app/src/main/java/.../MainActivity.java` | opakowanie: otwieranie i zapis plików systemowym oknem wyboru, pytanie przy wyjściu |
| `testy/rdzen.test.js` | testy rdzenia na prawdziwych backupach z `testy/dane/` |
| `.github/workflows/build.yml` | testy, potem APK do pobrania z zakładki Actions |

Ten sam `index.html` otwarty w Chrome na komputerze też działa (zapis idzie
wtedy do Pobranych) — wygodne do sprawdzania zmian bez telefonu.

## Co umie (wersja 1)

- kity: nazwa, efekt kitu z parametrami (zmiana efektu = wartości domyślne, jak na module),
- brzmienia padów: 162 wewnętrzne albo plik WAV z karty (po ścieżce w `ROLAND/TM-2/WAVE`), Level, Pitch, Pan, Mute Group, Note, Loop, Dynamics, Mono/Poly, Effect Send, Offset,
- ustawienia wejść: typ pada (z wartościami domyślnymi), Input, Rim Gain, H/R Adjust, Noise Cancel, Sensitivity, Threshold, Curve, Retrig Cancel, XTLK Cancel,
- SYSTEM: nazwa backupu, Contrast, Brightness, Battery, Limiter, OutGain, TrgPreview, Trig Lock, MIDI Ch, PrgChg Rx/Tx,
- lista zmian, cofnij / ponów, cofnij wszystko,
- zapis zawsze jako **nowy plik** z poprawną sumą MD5 — oryginału nigdy nie nadpisuje.

Na razie bez: wczytywania i obróbki sampli z telefonu (konwersja, mini edytor,
wyrównanie głośności) — to jest w wersji na Maca.

## Instalacja na telefonie

1. GitHub → zakładka **Actions** → ostatni zielony build → na dole **Artifacts** → `TM2Editor-NN`.
2. Rozpakuj ZIP, plik `TM2Editor-NN.apk` przenieś na telefon i otwórz.
3. Android zapyta o zgodę na instalację z tego źródła — zgódź się.

Kolejne buildy instalują się na poprzednim (ten sam klucz testowy
`app/testowy.keystore`). To klucz do testów, nie do Sklepu Play.

## Testy

```
node testy/rdzen.test.js
```
