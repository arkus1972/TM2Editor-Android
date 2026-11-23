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
const kontekst = {};
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

console.log(`\n${liczba} testów — wszystkie przeszły.`);
