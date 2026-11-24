// Testy rdzenia formatu — ten sam kod, który działa w aplikacji.
// Wyciągamy <script id="tm2-rdzen"> z index.html i uruchamiamy w Node.
// Uruchomienie (Terminal, w folderze repozytorium): node testy/rdzen.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const m = /<script id="tm2-rdzen">([\s\S]*?)<\/script>/.exec(html);
assert.ok(m, 'brak <script id="tm2-rdzen"> w index.html');
const kontekst = { btoa, atob };   // jak w przeglądarce
vm.createContext(kontekst);
vm.runInContext(m[1], kontekst);
const T = kontekst.TM2;

const dane = (n) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'dane', n)));
let liczba = 0;
const test = (nazwa, f) => { f(); liczba++; console.log('ok  ' + nazwa); };

test('MD5 zgodne z Node na każdym pliku i zapis bez zmian = oryginał', () => {
  for (const f of fs.readdirSync(path.join(__dirname, 'dane'))) {
    const b = dane(f);
    const wzor = crypto.createHash('md5').update(b.subarray(0, b.length - 16)).digest();
    assert.deepStrictEqual(Buffer.from(T.md5(b.subarray(0, b.length - 16))), wzor, f);
    assert.strictEqual(JSON.stringify(T.Backup.sprawdz(b)), '{"blad":false,"uwagi":[]}', f);
    assert.deepStrictEqual(Buffer.from(new T.Backup(b).doZapisu()), Buffer.from(b), f);
  }
});

test('obcy plik odrzucony', () => {
  assert.strictEqual(T.Backup.sprawdz(new Uint8Array(100)).blad, true);
  const zly = dane('wav-1.bin'); zly[0] = 0x58;
  assert.strictEqual(T.Backup.sprawdz(zly).blad, true);
});

test('efekty: kity 70–80 mają wartości domyślne swoich efektów', () => {
  const b = new T.Backup(dane('efekty-domyslne.bin'));
  const nazwy = [];
  for (let kit = 70; kit <= 80; kit++) {
    const e = b.efekt(kit);
    nazwy.push(e.nazwa);
    assert.strictEqual(b.ustawEfekt(kit, e.kod), false, 'kit ' + kit);   // nic do zmiany
  }
  assert.deepStrictEqual(nazwy, ['DELAY', 'TAPE ECHO', 'CHORUS', 'FLANGER', 'PHASER', 'EQUALIZER', 'COMP', 'WAH', 'DIST', 'RINGMOD', 'REVERB']);
});

test('typy padów: domyślne zgodne z pomiarem', () => {
  for (const f of ['typy-1.bin', 'typy-9.bin']) {
    const b = new T.Backup(dane(f));
    for (let r = 1; r <= 4; r++) assert.strictEqual(b.ustawTypPada(r, b.typPada(r).kod), false, f + ' rekord ' + r);
  }
});

test('sample z karty: odczyt i przypisanie', () => {
  const b = new T.Backup(dane('wav-1.bin'));
  assert.strictEqual(b.sciezkaSampla(70, 1), 'TEST_A.wav');
  assert.strictEqual(b.biezacyKit(), 70);
  b.przypiszSampel(3, 2, 'MOJE/KICK.wav');
  assert.strictEqual(b.sciezkaSampla(3, 2), 'MOJE/KICK.wav');
  assert.strictEqual(b.numerBrzmienia(3, 2), 0);
  assert.throws(() => b.przypiszSampel(3, 2, 'Ząb.wav'));
  assert.throws(() => b.przypiszSampel(3, 2, 'kick.mp3'));
  b.ustawBrzmienie(3, 2, 107);
  assert.strictEqual(b.opisBrzmienia(3, 2), '108 Boom Out');
});

test('SYSTEM: odczyt system-a.bin', () => {
  const b = new T.Backup(dane('system-a.bin'));
  const w = Object.fromEntries(T.POLA_SYSTEMU.map((p) => [p.id, T.tekstPola(p, b.wartosc(p))]));
  assert.strictEqual(w['sys.contrast'], '6');
  assert.strictEqual(w['sys.outGain'], '+12 dB');
  assert.strictEqual(w['sys.midiChannel'], '3');
  assert.strictEqual(w['sys.limiter'], 'OFF');
});

test('zmiany, cofanie wszystkiego, ponawianie, poprawna suma', () => {
  const b = new T.Backup(dane('baza-2026-11-21.bin'));
  const org = Buffer.from(b.b);
  b.ustaw(T.POLA_SLOTU[0], 55, 3, 2);
  b.ustaw(T.POLA_KITU[0], 'Zażółć', 3);
  b.ustawEfekt(3, 15);
  b.ustaw(T.PARAMETRY_EFEKTOW[15][1], 120, 3);
  b.ustawTypPada(2, 32);
  b.ustaw(T.POLA_SYSTEMU.find((p) => p.id === 'sys.outGain'), -6);
  assert.strictEqual(b.b[0x30], 250);
  assert.strictEqual(b.nazwaKitu(3), 'Zażółć');
  assert.throws(() => b.ustaw(T.PARAMETRY_EFEKTOW[19][1], 50, 3), /different kit effect/);
  assert.throws(() => b.ustaw(T.POLA_SLOTU[0], 101, 1, 1));
  const zapis = b.doZapisu();
  assert.deepStrictEqual(Buffer.from(zapis.subarray(-16)), crypto.createHash('md5').update(zapis.subarray(0, -16)).digest());
  while (b.cofnij());
  assert.deepStrictEqual(Buffer.from(b.b), org);
  while (b.ponowZmiane());
  assert.strictEqual(b.wartosc(T.PARAMETRY_EFEKTOW[15][1], 3), 120);
});

test('przytrzymany [+]: kolejne kroki jednego pola to jedna zmiana', () => {
  const b = new T.Backup(dane('baza-2026-11-21.bin'));
  const lvl = T.POLA_SLOTU[0];
  const start = b.wartosc(lvl, 5, 1);
  for (let i = 1; i <= 5; i++) b.ustaw(lvl, start - i, 5, 1);
  assert.strictEqual(b.zmiany.length, 1);
  b.ustaw(lvl, start, 5, 1);
  assert.strictEqual(b.zmiany.length, 0, 'powrót do wartości wyjściowej = brak zmiany');
  b.ustaw(lvl, start - 1, 5, 1);
  b.ustaw(T.POLA_SLOTU[1], 7, 5, 1);
  b.ustaw(lvl, start - 2, 5, 1);
  assert.strictEqual(b.zmiany.length, 3, 'inne pole pomiędzy = osobne zmiany');
});

test('opis zakresów jak na Macu', () => {
  const sys = (id) => T.POLA_SYSTEMU.find((p) => p.id === id);
  assert.strictEqual(T.opisZakresu(sys('sys.contrast')), '1 … 10');
  assert.strictEqual(T.opisZakresu(sys('sys.limiter')), '-24 dB … -1 dB, OFF');
  assert.strictEqual(T.opisZakresu(T.PARAMETRY_EFEKTOW[10][3]), '2:1, 3:1, 4:1, 8:1, 100:1');
  assert.strictEqual(T.opisZakresu(T.POLA_SLOTU[2]), 'L15 … R15');
  assert.strictEqual(T.INSTRUMENTY.length, 162);
  assert.strictEqual(T.LISTY.typPrzesteru.length, 25);
});

test('kopiowanie i zamiana kitów razem ze ścieżkami WAV, jedno cofnięcie', () => {
  const b = new T.Backup(dane('wav-1.bin'));
  const org = Buffer.from(b.b);
  const nazwa70 = b.nazwaKitu(70), nazwa1 = b.nazwaKitu(1);
  b.kopiujKit(70, 5);
  assert.strictEqual(b.nazwaKitu(5), nazwa70);
  assert.strictEqual(b.sciezkaSampla(5, 1), 'TEST_A.wav');
  assert.strictEqual(b.zmiany.length, 1);
  b.cofnij();
  assert.deepStrictEqual(Buffer.from(b.b), org);
  b.zamienKity(1, 70);
  assert.strictEqual(b.nazwaKitu(1), nazwa70);
  assert.strictEqual(b.nazwaKitu(70), nazwa1);
  assert.strictEqual(b.sciezkaSampla(1, 2), 'TEST_B.wav');
  assert.strictEqual(b.sciezkaSampla(70, 1), null);
  b.zamienKity(1, 70);
  assert.deepStrictEqual(Buffer.from(b.b.subarray(0, -16)), org.subarray(0, -16), 'dwie zamiany = stan wyjściowy');
  // globalne (SYSTEM, wejścia) nietknięte
  assert.deepStrictEqual(Buffer.from(b.b.subarray(0, 0x7C)), org.subarray(0, 0x7C));
});

test('przeciąganie: kit na inną pozycję, pozostałe schodzą o jedno miejsce', () => {
  const b = new T.Backup(dane('wav-1.bin'));
  const org = Buffer.from(b.b);
  const nazwy = Array.from({ length: 99 }, (_, i) => b.nazwaKitu(i + 1));
  b.przesunKit(70, 2);
  assert.strictEqual(b.nazwaKitu(2), nazwy[69]);
  assert.strictEqual(b.sciezkaSampla(2, 1), 'TEST_A.wav');
  assert.strictEqual(b.nazwaKitu(3), nazwy[1]);
  assert.strictEqual(b.nazwaKitu(70), nazwy[68]);
  assert.strictEqual(b.nazwaKitu(1), nazwy[0]);
  assert.strictEqual(b.zmiany.length, 1);
  b.przesunKit(1, 99);
  assert.strictEqual(b.nazwaKitu(99), nazwy[0]);
  b.cofnij(); b.cofnij();
  assert.deepStrictEqual(Buffer.from(b.b), org);
  assert.strictEqual(b.przesunKit(4, 4), false);
});

test('presety: zapis, plik biblioteki, zastosowanie na innym kicie', () => {
  const b = new T.Backup(dane('wav-1.bin'));
  const p = b.presetKitu(70, 'Testowy');
  assert.strictEqual(p.paths[0], 'TEST_A.wav');
  const plik = T.plikPresetow([p]);
  const wczytane = T.czytajPresety(plik);
  assert.strictEqual(wczytane.length, 1);
  b.zastosujPreset(wczytane[0], 12);
  assert.strictEqual(b.nazwaKitu(12), b.nazwaKitu(70));
  assert.strictEqual(b.sciezkaSampla(12, 1), 'TEST_A.wav');
  assert.deepStrictEqual(Buffer.from(b.b.subarray(b.kitOd(12), b.kitOd(12) + 234)), Buffer.from(b.b.subarray(b.kitOd(70), b.kitOd(70) + 234)));
  assert.throws(() => T.czytajPresety('{"x":1}'));
  assert.strictEqual(T.czytajPresety(JSON.stringify({ format: 'TM2Editor-KitPresets', version: 1, presets: [{ name: 'zły', kit: 'AAAA', paths: ['', '', '', ''] }] })).length, 0);
});

test('szukanie kitów po nazwie i pliku WAV', () => {
  const b = new T.Backup(dane('wav-1.bin'));
  assert.deepStrictEqual(Array.from(b.szukaj('test_c')), [70]);
  assert.ok(b.szukaj('ciecho').includes(1));
  assert.strictEqual(b.szukaj('').length, 99);
});

test('nowy backup: 99 × New Kit jak na module, poprawna suma, ustawienia z otwartego', () => {
  const baza = dane('baza-2026-11-21.bin');
  const n = T.Backup.nowy();
  assert.strictEqual(JSON.stringify(T.Backup.sprawdz(n.b)), '{"blad":false,"uwagi":[]}');
  assert.strictEqual(n.maNiezapisane, true);
  for (let k = 1; k <= 99; k++) {
    assert.strictEqual(n.nazwaKitu(k), 'New Kit');
    assert.deepStrictEqual(Buffer.from(n.b.subarray(n.kitOd(k), n.kitOd(k) + 234)), Buffer.from(baza.subarray(0x7C + 51 * 234, 0x7C + 52 * 234)));
  }
  assert.strictEqual(n.biezacyKit(), 1);
  assert.strictEqual(n.wszystkieSample().length, 0);
  const sys = T.POLA_SYSTEMU.find((p) => p.id === 'file.backupName');
  assert.strictEqual(n.wartosc(sys), 'Backup');
  const zOtwartego = T.Backup.nowy(dane('system-a.bin'));
  assert.deepStrictEqual(Buffer.from(zOtwartego.b.subarray(0x2C, 0x36)), Buffer.from(dane('system-a.bin').subarray(0x2C, 0x36)));
  assert.strictEqual(zOtwartego.b[0x36], 0);
  n.oznaczZapisane();
  assert.strictEqual(n.maNiezapisane, false);
});

test('backup fabryczny: bajt w bajt jak FactoryBackup.bin z modułu', () => {
  const f = T.Backup.fabryczny();
  assert.deepStrictEqual(Buffer.from(f.b), Buffer.from(dane('fabryczny.bin')));
  assert.strictEqual(f.nazwaKitu(1), 'Claps!');
  assert.strictEqual(f.nazwaKitu(50), 'Acoustic');
  assert.strictEqual(f.nazwaKitu(51), 'New Kit');
  assert.strictEqual(f.maNiezapisane, true);
  // Pusty nowy backup bez otwartego pliku ma fabryczny nagłówek.
  assert.deepStrictEqual(Buffer.from(T.Backup.nowy().b.subarray(0, 0x7C)), Buffer.from(dane('fabryczny.bin').subarray(0, 0x7C)));
});

console.log(`\n${liczba} testów — wszystkie przeszły.`);
