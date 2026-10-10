// FMSuperScout frontend — vanilla JS, gevirtualiseerde tabel voor 50k+ rijen.
'use strict';
const $ = id => document.getElementById(id);

const state = {
  mode: 'players',
  players: [], allPlayers: [], staff: [], clubs: [], meta: {},
  filtered: [],
  sortKey: 'ca', sortDir: -1,
  selected: null,
  cur: localStorage.getItem('fmss_cur') || '£',
  wagePer: localStorage.getItem('fmss_wageper') || 'w',   // salarisweergave: w(eek)/m(aand)/j(aar)
  lang: ['nl', 'en', 'fr', 'de'].includes(localStorage.getItem('fmss_lang')) ? localStorage.getItem('fmss_lang') : 'en',
  showPot: false,
  myTeam: 'all',   // teamchip bij "Mijn club": all | first | res | youth
  hideCapa: localStorage.getItem('fmss_hidecapa') === '1',
  hideMeta: localStorage.getItem('fmss_hidemeta') === '1',   // meta-score los van de overige verborgen stats
  role: localStorage.getItem('fmss_role') || '',
  compare: [],
  refYear: new Date().getFullYear(),
  refDoy: 183,
  shortlist: new Set(jread('fmss_shortlist', [])),
  bulkSelected: new Set(), bulkAnchor: null,
  colCfg: jread('fmss_cols', {}),  // per modus: {order:[], hidden:[]}
  colW: jread('fmss_colw', {}),    // per modus: {kolomkey: breedte px}
  advF: jread('fmss_adv', []),     // attribuutfilter-regels [{k,min,max}]
  advStaffF: jread('fmss_adv_staff', []), // staf attribuutfilter-regels [{k,min,max}]
  hist: null,        // {dates, refIdx, map: Map<uid,[caRef,paRef,firstIdx]>} uit /api/history/deltas
  histPeriod: localStorage.getItem('fmss_histperiod') || 'y1',
  bestXiFormation: localStorage.getItem('fmss_xi_formation') || '4-3-3',
  xiProfThreshold: (() => {
    const value = parseInt(localStorage.getItem('fmss_xi_prof_threshold') || '15', 10);
    return Number.isFinite(value) ? Math.max(1, Math.min(20, value)) : 15;
  })(),
  // Per-position limits for Analysis > Vs shortlist.  Keep these across sessions so
  // a scout's preferred depth comparison does not have to be rebuilt every time.
  vsClubCounts: jread('fmss_vs_club_counts', {}),
  vsShortlistCounts: jread('fmss_vs_shortlist_counts', {}),
  anTeamFilter: jread('fmss_an_team_filter', ['first', 'res', 'youth']),
  anProfThreshold: Math.max(1, Math.min(20, parseInt(localStorage.getItem('fmss_an_prof_threshold') || '15', 10) || 15)),
  anCardSort: jread('fmss_an_card_sort', { key: 'ca', dir: -1 }),
  vsSorts: jread('fmss_vs_sorts', {}),
  vsTeamFilter: jread('fmss_vs_team_filter', ['first', 'res', 'youth']),
  vsProfThreshold: parseInt(localStorage.getItem('fmss_vs_prof_threshold') || '15', 10),
  vsColCfg: jread('fmss_vs_cols', null),
  vsColW: jread('fmss_vs_colw', {}),
  vsLayout: localStorage.getItem('fmss_vs_layout') === 'side' ? 'side' : 'stack',
  profThreshold: parseInt(localStorage.getItem('fmss_profthreshold') || '15', 10),
  metaViewPos: localStorage.getItem('fmss_metaviewpos') || null,  // null = best across all positions; else a specific FM position key e.g. 'DC'
  xiIgnored: new Set(jread('fmss_xi_ignored', [])),  // player IDs excluded from Best XI calculation
};
let vsPositionMetaCache = new WeakMap();
let vsPotentialMetaCache = new WeakMap();
let analysisShortlistVersion = 0;
let analysisDataCache = null;
function invalidateAnalysisData() {
  analysisShortlistVersion++;
  analysisDataCache = null;
}

// FM uses type 30 for some reserve teams as well as the usual 1..9 range
// (notably in Dutch reserve competitions). Keep the raw value, but classify it
// here so it does not fall through to the youth chip.
const RESERVE_TEAM_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 30]);
function teamGroup(teamType) {
  if (teamType == null || teamType === '') return null;
  const tt = Number(teamType);
  if (!Number.isFinite(tt)) return null;
  if (tt === 0) return 'first';
  if (RESERVE_TEAM_TYPES.has(tt)) return 'res';
  if (tt >= 10) return 'youth';
  return null;
}

// Beschadigde browseropslag (één ongeldige JSON-waarde) mag de app nooit vóór het
// foutscherm laten crashen: kapotte sleutel → standaardwaarde, opslag opgeruimd.
function jread(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { try { localStorage.removeItem(key); } catch { } return fallback; }
}
// Resten van het oude mijlpaal-nudgesysteem (25/500/2000 profielen), vervangen door het
// seizoensrapport. Eenmalig opruimen zodat oude installs geen dode sleutels meeslepen.
try { ['fmss_donate', 'fmss_donate_at', 'fmss_days'].forEach(k => localStorage.removeItem(k)); } catch { }
// FM24 rekent intern in GBP en toont andere valuta met eigen vaste koersen (bevroren rond
// de database-lock, medio 2025). €: gekalibreerd tegen in-game waarden (docs/value-model.md).
// $: xe.com-koers uit diezelfde periode; verifieer tegen FM's eigen USD-weergave.
const CUR_RATE = { '£': 1, '€': 1.16, '$': 1.35 };
// App-versie: bij een release gelijk trekken met MyAppVersion in installer/FMSuperScout24.iss.
const APP_VERSION = '2.0.0';
const REPO_URL = 'https://github.com/mavarobli/FMSuperScout';

// ================= i18n =================
const I18N = {
  nl: {
    players: 'Spelers', staff: 'Staf', shortlist: 'Shortlist', searchph: 'Zoek naam of club',
    settings: 'Instellingen', langLabel: 'Taal', curLabel: 'Valuta',
    showHidden: 'Verborgen stats tonen', showMeta: 'Meta-score tonen',
    profileMode: 'Spelersprofiel', profSide: 'Rechts', profPopup: 'Popup',
    devTitle: 'Ontwikkeling',
    cardBtnTip: 'Spelerskaart opslaan (PNG)', cardSaved: 'Kaart opgeslagen in Downloads',
    donateBtn: 'Steun FMSuperScout',
    seasonTitle: 'Dat was seizoen {s}',
    seasonStatProfiles: '{n} profielen bekeken', seasonStatLoads: '{n}× de database geladen',
    seasonStatCards: '{n} spelerskaarten gedeeld', seasonStatShort: '{n} op de shortlist',
    seasonAsk: 'FMSuperScout deed het hele seizoen gratis mee. Een koffie is z\'n complete jaarsalaris.',
    alreadyDonated: 'Al gedoneerd?', neverAsk: 'Vraag het niet meer',
    supporterThanks: 'Dank je wel! Je hoort er niets meer over.',
    donateCta: '☕ Trakteer', donateLater: 'Later',
    position: 'Positie', clear: 'wis', staffrole: 'Staf-rol', quality: 'Kwaliteit & leeftijd',
    age: 'Leeftijd', financial: 'Financieel', maxvalue: 'Max. waarde', maxfee: 'Max. vraagprijs', maxwage: 'Max. loon',
    esSetupTitle: 'Start Football Manager 24 eerst een keer',
    esSetupBody: 'De eerste start na de installatie duurt 1 tot 3 minuten langer en toont een zwart consolevenster. Dat hoort zo: de mod-laag bouwt eenmalig zijn bestanden. Laat het venster open staan, ook als FM lijkt te hangen.',
    esSetupHint: 'Daarna laad je je save en druk je op Nieuwe data. De volgende keren start FM gewoon weer normaal.',
    devDeltaHint: 'Verandering over de getoonde periode: de laatste meting min de eerste. Groen is vooruitgang, rood achteruitgang.',
    c_growth: 'Groei', grNew: 'nieuw', development: 'Ontwikkeling', histPeriod: 'Periode',
    hp_last: 'Sinds vorige dump', hp_m6: 'Afgelopen 6 maanden', hp_y1: 'Afgelopen jaar',
    hp_season: 'Dit seizoen', hp_all: 'Sinds we meten', growthRange: 'Groei', onlyNew: 'Alleen nieuwe spelers',
    growthHint: 'CA-verandering sinds de gekozen peildatum, gemeten uit je eigen dumps. Groen = groei, rood = verlies, "nieuw" = bestond toen nog niet.\n\nElke Nieuwe data voegt een meetpunt toe: hoe langer je de tool gebruikt, hoe verder je terugkijkt.',
    onlyNewHint: 'Spelers die er op de peildatum nog niet waren. Meestal jeugdspelers uit een intake, soms iemand die vanuit een niet-geladen competitie jouw database in komt.',
    intakeTitle: 'Jeugdintake: {n} nieuwe spelers wereldwijd', intakeBest: 'Beste vooruitzicht: {p}',
    intakeShow: 'Toon de intake',
    physical: 'Fysiek', heightCm: 'Lengte (cm)', wonderkidOnly: 'Alleen wonderkids',
    wonderkidHint: 'Hoogstens 21 jaar, PA 150 of hoger en nog minstens 25 punten groei over (PA min CA). Dezelfde grens als het gouden randje op de spelerskaart.',
    origin: 'Herkomst', originComp: 'Herkomst & competitie', nat: 'Nationaliteit', euonly: 'Alleen EU/EEA', availability: 'Beschikbaarheid',
    interestmin: 'Interesse ≥', all: 'Alle', attainable: 'Beschikbaar', listed: 'Op transferlijst',
    tstatus: 'Transferstatus', tsSale: 'Te koop', tsLoan: 'Te huur', tsAny: 'Te koop of te huur',
    attainHint: 'Kan hij weg bij zijn club? Op de transferlijst, aangeboden, clubloos of contract loopt binnen 12 maanden af (en niet "niet te koop"). Zegt niets over of hij naar JOU wil; dat is Interesse.',
    exp6: '< 6 mnd', exp12: '< 1 jaar', free: 'Clubloos', myclub: 'Mijn club', contractF: 'Contract',
    advBtn: 'Attribuutfilter', advTitle: 'Filter op attributen', advSearch: 'Kies of typ een attribuut…',
    advAdd: '+ attribuut', advClear: 'Wissen', advDone: 'Klaar', advMin: 'min', advMax: 'max', advColAttr: 'Attribuut',
    reportBug: 'Probleem melden…', esReportHint: 'Nieuwe data gedrukt maar geen data?', updateAvail: 'Update {v} beschikbaar',
    updDl: 'Update downloaden… {pct}%', updVerify: 'Download controleren…',
    updLaunch: 'Installer gestart. Volg de stappen; de app start daarna opnieuw.',
    updErr: 'Updaten mislukt. Open de downloadpagina',
    updCheckBtn: 'Zoek updates', updChecking: 'Zoeken…',
    updNone: 'Je bent up-to-date (v{v})', updFound: 'Update {v} beschikbaar — zie de melding bovenin',
    updCheckErr: 'Controleren mislukt. Ben je online?',
    onlyshortlist: 'Alleen shortlist', clearfilters: 'Filters wissen', fetch: 'Nieuwe data',
    nodata: 'Nog geen data geladen', exportcsv: 'Shortlist exporteren (CSV)', importfmf: 'FMF importeren', clearshortlist: 'Shortlist wissen', bulkadd: 'Aan shortlist toevoegen', bulkcancel: 'Selectie annuleren', bulkselected: '{n} geselecteerd', fmfNamePrompt: 'Naam van de shortlist in FM24', fmfImportError: 'FMF importeren mislukt', fmfImported: '{name}: {n} spelers geïmporteerd', fmfMissing: '{n} spelers niet in de dump', fmfNoMatch: "FMF is gelezen, maar geen ID komt voor in deze dump ({n}). Spelers kunnen uit een andere save komen of inmiddels uit de actieve database zijn verdwenen.", clearShortConfirm: 'Wil je {n} spelers uit de shortlist verwijderen?', syncfm: 'Haal lijst uit FM24', syncfound: '{n} spelers uit FM24 geladen', syncmissing: 'Geen actieve spelerslijst gevonden in FM24',
    results: 'resultaten', c_name: 'Naam', c_age: 'Lft', c_pos: 'Positie', c_club: 'Club', c_nat: 'Nat',
    c_value: 'Waarde', c_fee: "Schatting vraagprijs", c_wage: 'Salaris', c_expires: 'Contract tot', c_interest: 'Interesse',
    c_status: 'Status', c_role: 'Rol', foot: 'Voet', footR: 'Rechts', footL: 'Links', footB: 'Beide', height: 'Lengte', repLabel: 'Reputatie',
    c_clubrep: 'Clubrep.', c_worldrep: 'Wereldrep.', c_div: 'Divisie',
    coachAttTac: 'Aanv · Tac', coachAttTech: 'Aanv · Tech', coachDefTac: 'Verd · Tac', coachDefTech: 'Verd · Tech', coachPossTac: 'Balz · Tac', coachPossTech: 'Balz · Tech', coachFitStrength: 'Fit · Kr', coachFitQuickness: 'Fit · Snelh', coachGkStop: 'GK · Stop', coachGkHandleDist: 'GK · Han/Dis', coachSetPieces: 'Standards',
    staffTrainingStarsHint: 'Geschatte FM24-basisrating volgens community-gemelde formule, vóór werkdrukcorrectie. DDM = vastberadenheid + discipline + motiveren. 5 sterren begint bij 271 punten; werkdruk is niet meegerekend.',
    estval: 'Gesch. waarde', wageLabel: 'Salaris', contractLabel: 'Contract tot', free_l: 'transfervrij',
    int_big: 'Groot', int_ok: 'Redelijk', int_small: 'Klein', int_no: 'Nee', interestTitle: 'Interesse-inschatting',
    interestHint: 'Wil deze speler naar jouw club? Geschat uit reputatieverschil, salaris, ambitie, loyaliteit, leeftijd en beschikbaarheid. FIFA-artikel 19 telt mee voor niet-EU-spelers onder de 18.\n\nSchatting, geen FM-getal: FM rekent pas tijdens de onderhandeling en weegt dan ook jouw bod. "Klein" kan bij een sterk bod alsnog ja worden.',
    minorNote: 'Te jong voor een transfer.', minorIntlNote: 'Als niet-EU-minderjarige pas vanaf 18 haalbaar (FIFA-regel voor internationale transfers).',
    ambition: 'Ambitie', loyalty: 'Loyaliteit', professionalism: 'Professionaliteit', adaptability: 'Aanpassing',
    pressure: 'Druk', sportsmanship: 'Sportiviteit', temperament: 'Temperament', controversy: 'Controverse', determination: 'Vastberadenheid',
    personaTitle: 'Persoonlijkheid',
    hiddenTitle: 'Verborgen kenmerken', a_Consistency: 'Constantheid', a_ImportantMatches: 'Grote wedstrijden',
    a_InjuryProneness: 'Blessuregevoeligheid', a_Versatility: 'Veelzijdigheid', a_Dirtiness: 'Vals spel',
    showPot: 'Toon geschatte potentie', potNote: 'geschatte waarden op potentieel (PA)',
    loanOut: 'verhuurd aan {c}', loanIn: 'gehuurd van {c}', ownerLabel: 'Moederclub',
    clubless: 'clubloos', clubUnknown: 'onbekende club', copied: 'Gekopieerd',
    copyNameTip: 'Klik = kopieer naam', slEmpty: 'Shortlist leeg',
    copyBtnTip: 'Kopieer naam', clubNotRead: 'Club niet uitgelezen (rep {r})',
    reqSent: 'Spelersdata inlezen…',
    dumping: 'Spelersdata inlezen…', dumpReady: 'Nieuwe data klaar, klik om te laden',
    dumpLoaded: 'Nieuwe data geladen',
    dumpError: 'Uitlezen mislukt', fmNotRunning: 'Start eerst Football Manager 24 en laad je save.',
    dumpIncomplete: 'De dump is onvolledig (FM24 was er waarschijnlijk nog mee bezig). Probeer het zo opnieuw.',
    reqNoPickup: 'FM24 pikt het verzoek niet op. Is je save geladen? Probeer anders Nieuwe data in de game, of herstart FM24.',
    reqNoPickupMore: 'Blijft dit terugkomen? Lees de fix',
    scanStalled: 'De scan lijkt gestopt (is FM24 afgesloten of gecrasht?). Herstart FM24 en probeer opnieuw.',
    serverGone: 'Geen verbinding met de lokale server. Sluit dit venster en start FMSuperScout opnieuw.',
    tag_free: 'clubloos', tag_listed: 'transferlijst', tag_loan: 'te huur', tag_rel: 'vrijgegeven', tag_nfs: 'niet te koop',
    colHint: 'Sleep om te verplaatsen · rechtsklik voor kolommen', colsTitle: 'Kolommen tonen', colsReset: 'Standaard herstellen',
    g_technical: 'Technisch', g_setpieces: 'Standaardsituaties', g_mental: 'Mentaal', g_physical: 'Fysiek', g_goalkeeping: 'Keepen', g_coaching: 'Coaching', g_knowledge: 'Kennis & Scouting', g_gkCoaching: 'Keeper-coaching',
    staffAttrs: 'Staf-attributen',
    clearAll: 'alles wissen', chipSearch: 'Zoek',
    loading: 'Data laden…',
    parsing: 'Data verwerken…',
    esErrTitle: 'De dump kon niet geladen worden',
    esErrBig: 'Er staat wél een dump op schijf, maar de app kon hem niet inlezen. Dit gebeurt vooral bij een heel grote save (veel competities geladen tegelijk). Meld het met de knop hieronder, dan kijken we ernaar.',
    esErrSize: 'Dump op schijf: {mb} MB',
    esErrReload: 'Opnieuw proberen',
    esErrCrash: 'De vorige laadpoging is vastgelopen, waarschijnlijk door te weinig vrij geheugen. Tip: sluit FM24 (de dump staat al op schijf, de game is niet nodig om te kijken) en klik daarna op Opnieuw proberen.',
    step1: 'Start <b>FM24</b> en laad je save',
    step2: 'Klik hier op <b>Nieuwe data</b>',
    step3: 'De data laadt vanzelf zodra de dump klaar is',
    playersWord: 'spelers', staffWord: 'staf', clickClubFilter: 'Klik = filter op jouw club', repWord: 'reputatie',
    roleFit: 'Tactische rol', roleColHdr: 'Rol', roleAny: 'Geen rol gekozen', bestRoles: 'Beste rollen', profThresholdLabel: 'Min. basisplaats',
    compare: 'Vergelijk', comparing: 'Vergelijken', addCompare: 'Vergelijk', compareFull: 'Max. 3 spelers',
    cmpTitle: 'Spelervergelijking', cmpValue: 'Waarde', cmpTopRole: 'Beste rol',
    cmpWinsBadge: '{n}× beste attribuut', avgLabel: 'Gemiddeld',
    mt_all: 'Alles', mt_first: '1e elftal', mt_res: '2e elftal', mt_youth: 'Jeugd',
    cmpDeltaHint: 'Verschil: speler 1 min speler 2 (groen = speler 1 beter af)',
    analysis: 'Analyse', anTitle: 'Squad-behoefteanalyse', anNoClub: 'Geen eigen club in de data gevonden.',
    anPlayers: 'spelers', anPlayerTotal: 'totaal spelers', anLowest: 'laagste', anAverage: 'gem.', anHighest: 'hoogste', anAvgAge: 'gem. leeftijd', anAvgCa: 'gem. CA', anTopCa: 'beste CA',
    anOk: 'Op sterkte', anThin: 'Dunne bezetting', anShort: 'Tekort', anAging: 'Vergrijzing', anNoSucc: 'Geen opvolging',
    anScout: 'Scout spelers', anYoungTalent: 'jongste talent', anNone: 'geen',
    anBiggestNeed: 'Grootste behoefte', anSquadSize: 'Selectie',
    anRecAging: 'Vergrijst; zoek een opvolger jonger dan {age} met PA boven {pa}.',
    anRecShort: 'Te weinig spelers; werf minimaal {n} extra ({pa}+ PA).',
    anRecThin: 'Dunne cover; een aanvulling van {pa}+ PA versterkt de diepte.',
    anRecSucc: 'Geen jong talent dat het niveau haalt; zoek U{age} met PA boven {pa}.',
    anRecAgingNp: 'Vergrijst; zoek een jongere opvolger.',
    anRecShortNp: 'Te weinig spelers; werf {n} extra.',
    anRecThinNp: 'Dunne cover; een aanvulling versterkt de diepte.',
    anRecSuccNp: 'Geen jong talent op niveau; zoek een groot U{age}-talent.',
    competition: 'Competitie', divLabel: 'Divisie', divSearch: 'Typ een competitie…',
    gameDateMemory: 'Datum in de game (uit het geheugen)', gameDateDerived: 'Geschatte in-game datum (jaar zeker, dag benaderd)',
    presetsTitle: 'Opgeslagen filters', presetSave: 'Huidige filters opslaan', presetNamePrompt: 'Naam voor deze zoekopdracht',
    presetSaved: 'Filter opgeslagen', presetNone: 'Nog geen opgeslagen filters.', presetPick: 'Kies opgeslagen filter…',
    presetDelConfirm: 'Weet je zeker dat je "{name}" wilt verwijderen?',
    presetEmptyFilters: 'Geen actieve filters om op te slaan',
    presetSaveTitle: 'Filters opslaan', presetDelTitle: 'Filter verwijderen',
    saveBtn: 'Opslaan', deleteBtn: 'Verwijderen', cancelBtn: 'Annuleren',
    scanDb: 'Database', dbMen: 'Mannen', dbWomen: 'Vrouwen', dbBoth: 'Beide',
    genderLabel: 'Geslacht', womenNote: 'Geldt vanaf de volgende scan (Nieuwe data)',
    scanDbHint: 'Kies welk geslacht de scan inleest bij de volgende Nieuwe data: alleen mannen, alleen vrouwen, of allebei. Bij Beide verschijnt een geslacht-filter in de zijbalk.',
    wagePer: 'Salaris per', perWeek: 'week', perMonth: 'maand', perYear: 'jaar',
    perWeekSuf: 'p/w', perMonthSuf: 'p/mnd', perYearSuf: 'p/jr', jobStaff: 'Staflid',
    c_meta: 'Meta', metaLabel: 'Meta-score', c_metapa: 'PA-meta',
    metaViewLabel: 'Toon meta voor positie...', metaViewBest: 'Beste (auto)',
    metaHint: 'Gecombineerde bijdrage van de attributen die wedstrijden winnen, gewogen naar FM-Arena-testresultaten. Snelheid en Versnelling tellen veruit het zwaarst. Keepers: eigen keepersweging (Reflexen, Behendigheid).\n\nHogere score = betere verwachte prestatie bij gelijke CA. Het gebruikte meta-preset bepaalt de schaal (zie instellingen → meta-gewichten).',
    metaPaHint: 'Dezelfde weging, toegepast op de attributen die hij op zijn potentieel (PA) naar verwachting haalt. Projectie volgt het groeiprofiel van zijn positiegroep; fysieke groei stopt na 23.\n\nUitontwikkeld = gelijk aan Meta. Sorteer hierop voor de meta-toppers van morgen.',
    verWarn: 'FM-versie {v} gedetecteerd; de uitlezing is geijkt op {s}.x. Data mogelijk onbetrouwbaar tot een update van FMSuperScout.',
    verWarnOldDump: 'Deze data komt uit een oudere FMSuperScout-dump. Alles werkt, maar klik met je save geladen op Nieuwe data voor het beste resultaat.',
    metaWeightsLabel: 'Meta-gewichten', metaWeightsLoad: 'Bestand laden…', metaWeightsReset: 'Standaard herstellen',
    clearAllData: 'Scoutingdata wissen', clearAllDataConfirm: 'Alle opgeslagen spelers-, staf-, shortlist- en groeigegevens wissen voor alle carrières?', clearAllDataDone: 'Alle opgeslagen gegevens zijn gewist.', clearAllDataError: 'Opgeslagen gegevens wissen is mislukt.',
    billion: 'mld',
    bestxi_title: 'Beste XI & Bank (Doublures)',
    bestxi_autoFind: 'Beste formatie zoeken', bestxi_editTactic: 'Tactiek aanpassen',
    bestxi_customOpt: '⚙️ Aangepaste Tactiek (Interactief)',
    bestxi_noClub: 'Geen club gedetecteerd. Selecteer een team via de filters (Mijn club).',
    bestxi_noPlayer: 'Geen speler', bestxi_vacantPost: 'Positie vacant',
    bestxi_bench: '🪑 Mijn Bank (Doublures)', bestxi_left: '(Links)', bestxi_right: '(Rechts)', bestxi_minProf: 'Min. positievermogen',
    bestxi_avgScore: 'Gemiddelde XI meta-score:',
    bestxi_autoToast: 'Optimale formatie: {f} ({s} gem.)',
    bestxi_autoFail: 'Geen formatie gevonden', bestxi_autoNoClub: 'Geen club geselecteerd',
    bestxi_ignore: 'Negeer', bestxi_resetIgnored: 'Reset uitgeslotenen', bestxi_ignored: 'Niet beschikbaar',
    tabMyPlayers: 'Mijn speler', tabBestxi: 'Beste XI',
    tactic_title: 'Aangepaste Tactiek ({n}/11 posities)', tactic_confirm: 'Bevestig opstelling',
    tactic_maxStarters: 'Maximum 11 basisspelers bereikt.',
    clubs_noResults: 'Geen clubs gevonden.',
  },
  en: {
    players: 'Players', staff: 'Staff', shortlist: 'Shortlist', searchph: 'Search name or club',
    settings: 'Settings', langLabel: 'Language', curLabel: 'Currency',
    showHidden: 'Show hidden stats', showMeta: 'Show meta score',
    profileMode: 'Player profile', profSide: 'Right side', profPopup: 'Popup',
    devTitle: 'Development',
    cardBtnTip: 'Save player card (PNG)', cardSaved: 'Card saved to Downloads',
    donateBtn: 'Support FMSuperScout',
    seasonTitle: 'That was season {s}',
    seasonStatProfiles: '{n} profiles viewed', seasonStatLoads: '{n} database loads',
    seasonStatCards: '{n} player cards shared', seasonStatShort: '{n} shortlisted',
    seasonAsk: 'FMSuperScout played the whole season for free. A coffee is its entire annual wage.',
    alreadyDonated: 'Already donated?', neverAsk: 'Don\'t ask again',
    supporterThanks: 'Thank you! You won\'t hear about this again.',
    donateCta: '☕ Buy me a coffee', donateLater: 'Maybe later',
    position: 'Position', clear: 'clear', staffrole: 'Staff role', quality: 'Quality & age',
    age: 'Age', financial: 'Financial', maxvalue: 'Max. value', maxfee: 'Max. asking price', maxwage: 'Max. wage',
    esSetupTitle: 'Start Football Manager 24 once first',
    esSetupBody: 'The first launch after installing takes 1 to 3 minutes longer and shows a black console window. That is normal: the mod layer builds its files once. Leave the window open, even if FM looks stuck.',
    esSetupHint: 'After that, load your save and press Nieuwe data. Later launches are back to normal speed.',
    devDeltaHint: 'Change over the period shown: the last reading minus the first. Green is progress, red is decline.',
    c_growth: 'Growth', grNew: 'new', development: 'Development', histPeriod: 'Period',
    hp_last: 'Since last dump', hp_m6: 'Last 6 months', hp_y1: 'Last year',
    hp_season: 'This season', hp_all: 'Since tracking began', growthRange: 'Growth', onlyNew: 'Only new players',
    growthHint: 'CA change since the chosen reference date, measured from your own dumps. Green = growth, red = decline, "new" = did not exist yet.\n\nEvery Nieuwe data adds a data point: the longer you use the tool, the further back you can look.',
    onlyNewHint: 'Players who did not exist at the reference date. Usually youth intake players, sometimes someone arriving in your database from a league you had not loaded.',
    intakeTitle: 'Youth intake: {n} new players worldwide', intakeBest: 'Best prospect: {p}',
    intakeShow: 'Show the intake',
    physical: 'Physical', heightCm: 'Height (cm)', wonderkidOnly: 'Wonderkids only',
    wonderkidHint: 'Age 21 or under, PA of 150 or more, and at least 25 points of growth left (PA minus CA). Same bar as the gold trim on the player card.',
    origin: 'Origin', originComp: 'Origin & competition', nat: 'Nationality', euonly: 'EU/EEA only', availability: 'Availability',
    interestmin: 'Interest ≥', all: 'All', attainable: 'Available', listed: 'Transfer listed',
    tstatus: 'Transfer status', tsSale: 'For sale', tsLoan: 'For loan', tsAny: 'For sale or loan',
    attainHint: 'Can he leave his club? Transfer listed, offered out, a free agent, or contract ends within 12 months (and not "not for sale"). Says nothing about whether he wants to join YOU; that is Interest.',
    exp6: '< 6 mo', exp12: '< 1 yr', free: 'Free agent', myclub: 'My club', contractF: 'Contract',
    advBtn: 'Attribute filter', advTitle: 'Filter on attributes', advSearch: 'Pick or type an attribute…',
    advAdd: '+ attribute', advClear: 'Clear', advDone: 'Done', advMin: 'min', advMax: 'max', advColAttr: 'Attribute',
    reportBug: 'Report a problem…', esReportHint: 'Pressed Nieuwe data but no data?', updateAvail: 'Update {v} available',
    updDl: 'Downloading update… {pct}%', updVerify: 'Verifying download…',
    updLaunch: 'Installer started. Follow the steps; the app restarts afterwards.',
    updErr: 'Update failed. Open the download page',
    updCheckBtn: 'Check for updates', updChecking: 'Checking…',
    updNone: "You're up to date (v{v})", updFound: 'Update {v} available — see the notice up top',
    updCheckErr: 'Check failed. Are you online?',
    onlyshortlist: 'Shortlist only', clearfilters: 'Clear filters', fetch: 'New data',
    nodata: 'No data loaded yet', exportcsv: 'Export shortlist (CSV)', importfmf: 'Import FMF', clearshortlist: 'Clear shortlist', bulkadd: 'Add to shortlist', bulkcancel: 'Cancel selection', bulkselected: '{n} selected', fmfNamePrompt: 'Shortlist name in FM24', fmfImportError: 'FMF import failed', fmfImported: '{name}: {n} players imported', fmfMissing: '{n} players not in the dump', fmfNoMatch: "FMF was read, but none of its {n} IDs exist in this dump. The players may be from another save or no longer active in this database.", clearShortConfirm: 'Remove {n} players from the shortlist?', syncfm: 'Get list from FM24', syncfound: '{n} players loaded from FM24', syncmissing: 'No active player list found in FM24',
    results: 'results', c_name: 'Name', c_age: 'Age', c_pos: 'Position', c_club: 'Club', c_nat: 'Nat',
    c_value: 'Value', c_fee: "Est. asking price", c_wage: 'Wage', c_expires: 'Contract until', c_interest: 'Interest',
    c_status: 'Status', c_role: 'Role', foot: 'Foot', footR: 'Right', footL: 'Left', footB: 'Both', height: 'Height', repLabel: 'Reputation',
    c_clubrep: 'Club rep', c_worldrep: 'World rep', c_div: 'Division',
    coachAttTac: 'Att · Tac', coachAttTech: 'Att · Tech', coachDefTac: 'Def · Tac', coachDefTech: 'Def · Tech', coachPossTac: 'Poss · Tac', coachPossTech: 'Poss · Tech', coachFitStrength: 'Fit · Str', coachFitQuickness: 'Fit · Quick', coachGkStop: 'GK · Stop', coachGkHandleDist: 'GK · H/D', coachSetPieces: 'Set Pieces',
    staffTrainingStarsHint: 'Estimated FM24 base stars using the community-reported formula, before workload adjustments. DDM = Determination + Level of Discipline + Motivating. 5 stars starts at 271 points; workload is not included.',
    estval: 'Est. value', wageLabel: 'Wage', contractLabel: 'Contract until', free_l: 'free',
    int_big: 'High', int_ok: 'Fair', int_small: 'Low', int_no: 'No', interestTitle: 'Interest estimate',
    interestHint: 'Would this player join your club? Estimated from the reputation gap, wages, ambition, loyalty, age and availability. FIFA article 19 applies to non-EU players under 18.\n\nAn estimate, not an FM number: FM decides during the actual negotiation and weighs your offer. A "Low" can still say yes to a strong bid.',
    minorNote: 'Too young for a transfer.', minorIntlNote: 'As a non-EU minor, only feasible from age 18 (FIFA rule on international transfers).',
    ambition: 'Ambition', loyalty: 'Loyalty', professionalism: 'Professionalism', adaptability: 'Adaptability',
    pressure: 'Pressure', sportsmanship: 'Sportsmanship', temperament: 'Temperament', controversy: 'Controversy', determination: 'Determination',
    personaTitle: 'Personality',
    hiddenTitle: 'Hidden', a_Consistency: 'Consistency', a_ImportantMatches: 'Big matches',
    a_InjuryProneness: 'Injury proneness', a_Versatility: 'Versatility', a_Dirtiness: 'Dirtiness',
    showPot: 'Show estimated potential', potNote: 'estimated values at potential (PA)',
    loanOut: 'on loan at {c}', loanIn: 'on loan from {c}', ownerLabel: 'Parent club',
    clubless: 'free agent', clubUnknown: 'unknown club', copied: 'Copied',
    copyNameTip: 'Click = copy name', slEmpty: 'Shortlist is empty',
    copyBtnTip: 'Copy name', clubNotRead: 'Club not resolved (rep {r})',
    reqSent: 'Reading player data…',
    dumping: 'Reading player data…', dumpReady: 'New data ready, click to load',
    dumpLoaded: 'New data loaded',
    dumpError: 'Read failed', fmNotRunning: 'Start Football Manager 24 and load your save first.',
    dumpIncomplete: 'The dump is incomplete (FM24 was probably still writing it). Try again in a moment.',
    reqNoPickup: 'FM24 is not picking up the request. Is your save loaded? Try Nieuwe data in the game, or restart FM24.',
    reqNoPickupMore: 'Keeps coming back? Read the fix',
    scanStalled: 'The scan appears to have stopped (was FM24 closed, or did it crash?). Restart FM24 and try again.',
    serverGone: 'Lost connection to the local server. Close this window and start FMSuperScout again.',
    tag_free: 'free', tag_listed: 'listed', tag_loan: 'for loan', tag_rel: 'released', tag_nfs: 'not for sale',
    colHint: 'Drag to reorder · right-click for columns', colsTitle: 'Show columns', colsReset: 'Reset to default',
    g_technical: 'Technical', g_setpieces: 'Set Pieces', g_mental: 'Mental', g_physical: 'Physical', g_goalkeeping: 'Goalkeeping', g_coaching: 'Coaching', g_knowledge: 'Knowledge & Scouting', g_gkCoaching: 'Goalkeeper Coaching',
    staffAttrs: 'Staff attributes',
    clearAll: 'clear all', chipSearch: 'Search',
    loading: 'Loading data…',
    parsing: 'Processing data…',
    esErrTitle: 'The dump could not be loaded',
    esErrBig: 'There is a dump on disk, but the app could not read it. This mostly happens with a very large save (many leagues loaded at once). Report it with the button below and we will look into it.',
    esErrSize: 'Dump on disk: {mb} MB',
    esErrReload: 'Try again',
    esErrCrash: 'The previous load attempt crashed, most likely because the system ran out of free memory. Tip: close FM24 (the dump is already on disk, the game is not needed for viewing), then click Try again.',
    step1: 'Start <b>FM24</b> and load your save',
    step2: 'Click <b>New data</b> here',
    step3: 'The data loads automatically once the dump is ready',
    playersWord: 'players', staffWord: 'staff', clickClubFilter: 'Click = filter on your club', repWord: 'reputation',
    roleFit: 'Tactical role', roleColHdr: 'Role', roleAny: 'No role selected', bestRoles: 'Best roles', profThresholdLabel: 'Min. proficiency',
    compare: 'Compare', comparing: 'Comparing', addCompare: 'Compare', compareFull: 'Max. 3 players',
    cmpTitle: 'Player comparison', cmpValue: 'Value', cmpTopRole: 'Best role',
    cmpWinsBadge: '{n}× best attribute', avgLabel: 'Average',
    mt_all: 'All', mt_first: 'First team', mt_res: 'Reserves', mt_youth: 'Youth',
    cmpDeltaHint: 'Difference: player 1 minus player 2 (green = player 1 better off)',
    analysis: 'Analysis', anTitle: 'Squad needs analysis', anNoClub: 'No own club found in the data.',
    anPlayers: 'players', anPlayerTotal: 'total players', anLowest: 'Lowest', anAverage: 'Avg', anHighest: 'Highest', anAvgAge: 'avg age', anAvgCa: 'avg CA', anTopCa: 'top CA',
    anOk: 'Well stocked', anThin: 'Thin cover', anShort: 'Shortage', anAging: 'Aging', anNoSucc: 'No succession',
    anScout: 'Scout players', anYoungTalent: 'youngest talent', anNone: 'none',
    anBiggestNeed: 'Biggest need', anSquadSize: 'Squad',
    anRecAging: 'Aging; find a successor under {age} with PA above {pa}.',
    anRecShort: 'Too few players; sign at least {n} more ({pa}+ PA).',
    anRecThin: 'Thin cover; an addition of {pa}+ PA improves depth.',
    anRecSucc: 'No young talent reaching the level; look for U{age} with PA above {pa}.',
    anRecAgingNp: 'Aging; find a younger successor.',
    anRecShortNp: 'Too few players; sign {n} more.',
    anRecThinNp: 'Thin cover; an addition improves depth.',
    anRecSuccNp: 'No young talent at the level; find a top U{age} prospect.',
    competition: 'Competition', divLabel: 'Division', divSearch: 'Type a competition…',
    gameDateMemory: 'In-game date (read from memory)', gameDateDerived: 'Estimated in-game date (year certain, day approximate)',
    presetsTitle: 'Saved filters', presetSave: 'Save current filters', presetNamePrompt: 'Name for this search',
    presetSaved: 'Filter saved', presetNone: 'No saved filters yet.', presetPick: 'Pick a saved filter…',
    presetDelConfirm: 'Are you sure you want to delete "{name}"?',
    presetEmptyFilters: 'No active filters to save',
    presetSaveTitle: 'Save filters', presetDelTitle: 'Delete filter',
    saveBtn: 'Save', deleteBtn: 'Delete', cancelBtn: 'Cancel',
    scanDb: 'Database', dbMen: 'Men', dbWomen: 'Women', dbBoth: 'Both',
    genderLabel: 'Gender', womenNote: 'Applies from the next scan (Nieuwe data)',
    scanDbHint: 'Choose which gender the next scan (Nieuwe data) loads: men only, women only, or both. With Both, a gender filter appears in the sidebar.',
    wagePer: 'Wage per', perWeek: 'week', perMonth: 'month', perYear: 'year',
    perWeekSuf: '/wk', perMonthSuf: '/mo', perYearSuf: '/yr', jobStaff: 'Staff member',
    c_meta: 'Meta', metaLabel: 'Meta score', c_metapa: 'PA meta',
    metaViewLabel: 'Show meta for position...', metaViewBest: 'Best (auto)',
    metaHint: 'Combined contribution of the attributes that win matches, weighted by FM-Arena test results. Pace and Acceleration count heaviest by far. Goalkeepers: own keeper weighting (Reflexes, Agility).\n\nHigher score = better expected performance at equal CA. The scale depends on the active meta preset (see settings → meta weights).',
    metaPaHint: 'The same weighting, applied to the attributes he is expected to reach at his potential (PA). The projection follows his position group\'s growth profile; physical growth stops after 23.\n\nFully developed = same as Meta. Sort on this for tomorrow\'s meta stars.',
    verWarn: 'FM version {v} detected; memory reading is calibrated for {s}.x. Data may be unreliable until FMSuperScout is updated.',
    verWarnOldDump: 'This data was made by an older FMSuperScout dump. Everything works, but click New data with your save loaded for the best results.',
    metaWeightsLabel: 'Meta weights', metaWeightsLoad: 'Load file…', metaWeightsReset: 'Reset to default',
    clearAllData: 'Clear all scouting data', clearAllDataConfirm: 'Delete saved player and staff data, shortlists, and growth history for all careers? This cannot be undone.', clearAllDataDone: 'All saved scouting data has been cleared.', clearAllDataError: 'Could not clear saved scouting data.',
    billion: 'B',
    bestxi_title: 'Best XI & Bench (Cover)',
    bestxi_autoFind: 'Find best formation', bestxi_editTactic: 'Edit tactic',
    bestxi_customOpt: '⚙️ Custom Tactic (Interactive)',
    bestxi_noClub: 'No club detected. Select a team via the filters (My club).',
    bestxi_noPlayer: 'No player', bestxi_vacantPost: 'Vacant position',
    bestxi_bench: '🪑 My Bench (Cover)', bestxi_left: '(Left)', bestxi_right: '(Right)', bestxi_minProf: 'Min. position proficiency',
    bestxi_avgScore: 'Average XI meta score:',
    bestxi_autoToast: 'Optimal formation: {f} ({s} avg.)',
    bestxi_autoFail: 'Could not find a formation', bestxi_autoNoClub: 'No club selected',
    bestxi_ignore: 'Ignore', bestxi_resetIgnored: 'Reset unavailable', bestxi_ignored: 'Unavailable',
    tabMyPlayers: 'My Player', tabBestxi: 'Best XI',
    tactic_title: 'Custom Tactic ({n}/11 positions)', tactic_confirm: 'Confirm formation',
    tactic_maxStarters: 'Maximum 11 starters reached.',
    clubs_noResults: 'No clubs found.',
  },
  fr: {
    players: 'Joueurs', staff: 'Staff', shortlist: 'Shortlist', searchph: 'Nom ou club…',
    settings: 'Paramètres', langLabel: 'Langue', curLabel: 'Devise',
    showHidden: 'Afficher les stats cachées', showMeta: 'Afficher le score méta',
    profileMode: 'Profil du joueur', profSide: 'À droite', profPopup: 'Popup',
    devTitle: 'Progression',
    cardBtnTip: 'Enregistrer la carte du joueur (PNG)', cardSaved: 'Carte enregistrée dans Téléchargements',
    donateBtn: 'Soutenir FMSuperScout',
    seasonTitle: 'C\'était la saison {s}',
    seasonStatProfiles: '{n} profils consultés', seasonStatLoads: '{n} chargements de la base',
    seasonStatCards: '{n} cartes partagées', seasonStatShort: '{n} sur la shortlist',
    seasonAsk: 'FMSuperScout a bossé toute la saison gratuitement. Un café, c\'est son salaire annuel.',
    alreadyDonated: 'Déjà donné ?', neverAsk: 'Ne plus demander',
    supporterThanks: 'Merci ! Vous n\'en entendrez plus parler.',
    donateCta: '☕ Offrir un café', donateLater: 'Plus tard',
    position: 'Poste', clear: 'effacer', staffrole: 'Rôle du staff', quality: 'Qualité et âge',
    age: 'Âge', financial: 'Finances', maxvalue: 'Valeur max.', maxfee: 'Prix demandé max.', maxwage: 'Salaire max.',
    esSetupTitle: 'Lancez d\'abord Football Manager 24 une fois',
    esSetupBody: 'Le premier lancement après l\'installation prend 1 à 3 minutes de plus et affiche une console noire. C\'est normal : la couche de mods génère ses fichiers une seule fois. Laissez la fenêtre ouverte, même si FM semble figé.',
    esSetupHint: 'Ensuite chargez votre sauvegarde et appuyez sur Nieuwe data. Les lancements suivants seront normaux.',
    devDeltaHint: 'Évolution sur la période affichée : dernière mesure moins la première. Vert = progrès, rouge = recul.',
    c_growth: 'Progrès', grNew: 'nouveau', development: 'Progression', histPeriod: 'Période',
    hp_last: 'Depuis le dernier dump', hp_m6: '6 derniers mois', hp_y1: 'Dernière année',
    hp_season: 'Cette saison', hp_all: 'Depuis le début', growthRange: 'Progrès', onlyNew: 'Nouveaux joueurs uniquement',
    growthHint: 'Évolution de la CA depuis la date de référence, mesurée dans vos propres dumps. Vert = progrès, rouge = recul, "nouveau" = n\'existait pas encore.\n\nChaque Nieuwe data ajoute un point de mesure : plus vous utilisez l\'outil, plus vous remontez loin.',
    onlyNewHint: 'Joueurs absents à la date de référence. En général des jeunes issus d\'une intake, parfois un joueur arrivé d\'un championnat non chargé.',
    intakeTitle: 'Intake : {n} nouveaux joueurs dans le monde', intakeBest: 'Meilleur espoir : {p}',
    intakeShow: 'Voir l\'intake',
    physical: 'Physique', heightCm: 'Taille (cm)', wonderkidOnly: 'Wonderkids uniquement',
    wonderkidHint: '21 ans max, PA de 150 ou plus et au moins 25 points de marge (PA moins CA). Même seuil que le liseré doré de la carte.',
    origin: 'Origine', originComp: 'Origine et championnat', nat: 'Nationalité', euonly: 'UE/EEE uniquement', availability: 'Disponibilité',
    interestmin: 'Intérêt ≥', all: 'Tous', attainable: 'Disponible', listed: 'Transférable',
    tstatus: 'Statut de transfert', tsSale: 'À vendre', tsLoan: 'À prêter', tsAny: 'À vendre ou à prêter',
    attainHint: 'Peut-il quitter son club ? Listé, proposé, libre ou en fin de contrat sous 12 mois (et pas "pas à vendre"). Ne dit rien sur son envie de VOUS rejoindre : ça, c\'est l\'Intérêt.',
    exp6: '< 6 mois', exp12: '< 1 an', free: 'Libre', myclub: 'Mon club', contractF: 'Contrat',
    advBtn: 'Filtre d\'attributs', advTitle: 'Filtrer par attributs', advSearch: 'Choisissez ou tapez un attribut…',
    advAdd: '+ attribut', advClear: 'Effacer', advDone: 'OK', advMin: 'min', advMax: 'max', advColAttr: 'Attribut',
    reportBug: 'Signaler un problème…', esReportHint: 'Nieuwe data pressé mais pas de données ?', updateAvail: 'Mise à jour {v} disponible',
    updDl: 'Téléchargement… {pct}%', updVerify: 'Vérification du téléchargement…',
    updLaunch: 'Installateur lancé. Suivez les étapes ; l\'app redémarre ensuite.',
    updErr: 'Échec de la mise à jour. Ouvrir la page de téléchargement',
    updCheckBtn: 'Rechercher des mises à jour', updChecking: 'Recherche…',
    updNone: 'Vous êtes à jour (v{v})', updFound: 'Mise à jour {v} disponible, voir la notification en haut',
    updCheckErr: 'Vérification impossible. Êtes-vous en ligne ?',
    onlyshortlist: 'Shortlist uniquement', clearfilters: 'Effacer les filtres', fetch: 'Nouvelles données',
    nodata: 'Aucune donnée chargée', exportcsv: 'Exporter la shortlist (CSV)', importfmf: 'Importer un FMF', clearshortlist: 'Effacer la shortlist', bulkadd: 'Ajouter à la shortlist', bulkcancel: 'Annuler la sélection', bulkselected: '{n} sélectionnés', fmfNamePrompt: 'Nom de la shortlist dans FM24', fmfImportError: 'Échec de l’import FMF', fmfImported: '{name} : {n} joueurs importés', fmfMissing: '{n} joueurs absents du dump', fmfNoMatch: "Le FMF a ete lu, mais aucun ID ne figure dans ce dump. Les joueurs ne sont peut etre plus actifs ou viennent d'une autre sauvegarde.", clearShortConfirm: 'Supprimer {n} joueurs de la shortlist ?', syncfm: 'Charger depuis FM24', syncfound: '{n} joueurs chargés depuis FM24', syncmissing: 'Aucune liste active trouvée dans FM24',
    results: 'résultats', c_name: 'Nom', c_age: 'Âge', c_pos: 'Poste', c_club: 'Club', c_nat: 'Nat',
    c_value: 'Valeur', c_fee: "Prix demande estimatif", c_wage: 'Salaire', c_expires: 'Contrat jusqu\'au', c_interest: 'Intérêt',
    c_status: 'Statut', c_role: 'Rôle', foot: 'Pied', footR: 'Droit', footL: 'Gauche', footB: 'Les deux', height: 'Taille', repLabel: 'Réputation',
    c_clubrep: 'Rép. club', c_worldrep: 'Rép. mondiale', c_div: 'Division',
    coachAttTac: 'Att · Tact', coachAttTech: 'Att · Tech', coachDefTac: 'Déf · Tact', coachDefTech: 'Déf · Tech', coachPossTac: 'Poss · Tact', coachPossTech: 'Poss · Tech', coachFitStrength: 'Phys · Force', coachFitQuickness: 'Phys · Vitesse', coachGkStop: 'GB · Arrêts', coachGkHandleDist: 'GB · Prise/Rel.', coachSetPieces: 'CPA',
    staffTrainingStarsHint: 'Estimation des étoiles FM24 selon une formule rapportée par la communauté, avant correction de charge. DDM = détermination + discipline + motivation. 5 étoiles commencent à 271 points ; la charge de travail est exclue.',
    estval: 'Valeur est.', wageLabel: 'Salaire', contractLabel: 'Contrat jusqu\'au', free_l: 'libre',
    int_big: 'Fort', int_ok: 'Correct', int_small: 'Faible', int_no: 'Non', interestTitle: 'Estimation d\'intérêt',
    interestHint: 'Ce joueur rejoindrait-il votre club ? Estimé à partir de l\'écart de réputation, du salaire, de l\'ambition, de la loyauté, de l\'âge et de la disponibilité. L\'article 19 de la FIFA s\'applique aux non-UE de moins de 18 ans.\n\nUne estimation, pas un chiffre FM : FM tranche pendant la négociation et pèse votre offre. Un "Faible" peut dire oui à une belle offre.',
    minorNote: 'Trop jeune pour un transfert.', minorIntlNote: 'Mineur non-UE : possible seulement à partir de 18 ans (règle FIFA sur les transferts internationaux).',
    ambition: 'Ambition', loyalty: 'Loyauté', professionalism: 'Professionnalisme', adaptability: 'Adaptabilité',
    pressure: 'Pression', sportsmanship: 'Fair-play', temperament: 'Tempérament', controversy: 'Controverse', determination: 'Détermination',
    personaTitle: 'Personnalité',
    hiddenTitle: 'Caractéristiques cachées', a_Consistency: 'Régularité', a_ImportantMatches: 'Grands matchs',
    a_InjuryProneness: 'Fragilité', a_Versatility: 'Polyvalence', a_Dirtiness: 'Antijeu',
    showPot: 'Voir le potentiel estimé', potNote: 'valeurs estimées au potentiel (PA)',
    loanOut: 'prêté à {c}', loanIn: 'prêté par {c}', ownerLabel: 'Club propriétaire',
    clubless: 'sans club', clubUnknown: 'club inconnu', copied: 'Copié',
    copyNameTip: 'Clic = copier le nom', slEmpty: 'Shortlist vide',
    copyBtnTip: 'Copier le nom', clubNotRead: 'Club non résolu (rép {r})',
    reqSent: 'Lecture des données…',
    dumping: 'Lecture des données…', dumpReady: 'Nouvelles données prêtes, cliquez pour charger',
    dumpLoaded: 'Nouvelles données chargées',
    dumpError: 'Échec de la lecture', fmNotRunning: 'Lancez d\'abord Football Manager 24 et chargez votre sauvegarde.',
    dumpIncomplete: 'Le dump est incomplet (FM24 était sans doute encore occupé). Réessayez dans un instant.',
    reqNoPickup: 'FM24 ne reçoit pas la demande. Sauvegarde chargée ? Essayez Nieuwe data dans le jeu, ou relancez FM24.',
    reqNoPickupMore: 'Ça revient sans cesse ? Lisez le correctif',
    scanStalled: 'Le scan semble arrêté (FM24 fermé ou planté ?). Relancez FM24 et réessayez.',
    serverGone: 'Pas de connexion au serveur local. Fermez cette fenêtre et relancez FMSuperScout.',
    tag_free: 'libre', tag_listed: 'transférable', tag_loan: 'à prêter', tag_rel: 'libéré', tag_nfs: 'pas à vendre',
    colHint: 'Glissez pour déplacer · clic droit pour les colonnes', colsTitle: 'Colonnes affichées', colsReset: 'Rétablir par défaut',
    g_technical: 'Technique', g_setpieces: 'Coups de pied arrêtés', g_mental: 'Mental', g_physical: 'Physique', g_goalkeeping: 'Gardien', g_coaching: 'Entraînement', g_knowledge: 'Connaissances et recrutement', g_gkCoaching: 'Entraînement des gardiens',
    staffAttrs: 'Attributs du staff',
    clearAll: 'tout effacer', chipSearch: 'Rechercher',
    loading: 'Chargement…',
    parsing: 'Traitement…',
    esErrTitle: 'Impossible de charger le dump',
    esErrBig: 'Un dump existe sur le disque, mais l\'app n\'a pas pu le lire. Cela arrive surtout avec une très grosse sauvegarde (beaucoup de championnats chargés). Signalez-le avec le bouton ci-dessous.',
    esErrSize: 'Dump sur disque : {mb} Mo',
    esErrReload: 'Réessayer',
    esErrCrash: 'Le chargement précédent a échoué, probablement par manque de mémoire. Astuce : fermez FM24 (le dump est déjà sur le disque) puis cliquez sur Réessayer.',
    step1: 'Lancez <b>FM24</b> et chargez votre sauvegarde',
    step2: 'Cliquez ici sur <b>Nouvelles données</b>',
    step3: 'Les données se chargent dès que le dump est prêt',
    playersWord: 'joueurs', staffWord: 'staff', clickClubFilter: 'Clic = filtrer sur votre club', repWord: 'réputation',
    roleFit: 'Rôle tactique', roleColHdr: 'Rôle', roleAny: 'Aucun rôle choisi', bestRoles: 'Meilleurs rôles', profThresholdLabel: 'Min. maîtrise',
    compare: 'Comparer', comparing: 'Comparaison', addCompare: 'Comparer', compareFull: '3 joueurs max.',
    cmpTitle: 'Comparaison de joueurs', cmpValue: 'Valeur', cmpTopRole: 'Meilleur rôle',
    cmpWinsBadge: '{n}× meilleur attribut', avgLabel: 'Moyenne',
    mt_all: 'Tout', mt_first: 'Équipe première', mt_res: 'Réserve', mt_youth: 'Jeunes',
    cmpDeltaHint: 'Écart : joueur 1 moins joueur 2 (vert = avantage joueur 1)',
    analysis: 'Analyse', anTitle: 'Analyse des besoins de l\'effectif', anNoClub: 'Aucun club à vous trouvé dans les données.',
    anPlayers: 'joueurs', anPlayerTotal: 'total de joueurs', anLowest: 'minimum', anAverage: 'moy.', anHighest: 'maximum', anAvgAge: 'âge moyen', anAvgCa: 'CA moyenne', anTopCa: 'meilleure CA',
    anOk: 'Au niveau', anThin: 'Effectif mince', anShort: 'Manque', anAging: 'Vieillissant', anNoSucc: 'Pas de relève',
    anScout: 'Scouter des joueurs', anYoungTalent: 'plus jeune talent', anNone: 'aucun',
    anBiggestNeed: 'Plus grand besoin', anSquadSize: 'Effectif',
    anRecAging: 'Vieillissant ; cherchez un successeur de moins de {age} ans avec plus de {pa} de PA.',
    anRecShort: 'Trop peu de joueurs ; recrutez au moins {n} de plus ({pa}+ PA).',
    anRecThin: 'Couverture mince ; un renfort de {pa}+ PA étoffera la rotation.',
    anRecSucc: 'Aucun jeune au niveau ; cherchez un U{age} avec plus de {pa} de PA.',
    anRecAgingNp: 'Vieillissant ; cherchez un successeur plus jeune.',
    anRecShortNp: 'Trop peu de joueurs ; recrutez-en {n} de plus.',
    anRecThinNp: 'Couverture mince ; un renfort étoffera la rotation.',
    anRecSuccNp: 'Aucun jeune au niveau ; cherchez un grand talent U{age}.',
    competition: 'Championnat', divLabel: 'Division', divSearch: 'Tapez un championnat…',
    gameDateMemory: 'Date en jeu (lue en mémoire)', gameDateDerived: 'Date en jeu estimée (année sûre, jour approché)',
    presetsTitle: 'Filtres enregistrés', presetSave: 'Enregistrer les filtres actuels', presetNamePrompt: 'Nom de cette recherche',
    presetSaved: 'Filtre enregistré', presetNone: 'Aucun filtre enregistré.', presetPick: 'Choisir un filtre…',
    presetDelConfirm: 'Supprimer "{name}" ?',
    presetEmptyFilters: 'Aucun filtre actif à enregistrer',
    presetSaveTitle: 'Enregistrer les filtres', presetDelTitle: 'Supprimer le filtre',
    saveBtn: 'Enregistrer', deleteBtn: 'Supprimer', cancelBtn: 'Annuler',
    scanDb: 'Base de données', dbMen: 'Hommes', dbWomen: 'Femmes', dbBoth: 'Les deux',
    genderLabel: 'Sexe', womenNote: 'Valable à partir du prochain scan (Nieuwe data)',
    scanDbHint: 'Choisissez quel sexe le prochain scan (Nieuwe data) charge : hommes seuls, femmes seules, ou les deux. Avec Les deux, un filtre sexe apparaît dans la barre latérale.',
    wagePer: 'Salaire par', perWeek: 'semaine', perMonth: 'mois', perYear: 'an',
    perWeekSuf: '/sem', perMonthSuf: '/mois', perYearSuf: '/an', jobStaff: 'Membre du staff',
    c_meta: 'Méta', metaLabel: 'Score méta', c_metapa: 'Méta PA',
    metaViewLabel: 'Afficher le méta pour le poste...', metaViewBest: 'Meilleur (auto)',
    metaHint: 'Moyenne pondérée (1-20) des attributs qui gagnent des matchs selon les tests du moteur de FM-Arena ; Vitesse et Accélération pèsent de loin le plus lourd. Gardiens : pondération propre issue du test des gardiens (Réflexes, Agilité).\n\n15+ élite, 13-15 fort, 11-13 correct. À CA égale, le Méta le plus haut performe en général mieux.',
    metaPaHint: 'La même pondération méta, appliquée aux attributs qu\'il devrait atteindre à son potentiel (PA). La projection suit le profil de progression de son groupe de postes ; le physique cesse de progresser après 23 ans.\n\nJoueur abouti = identique au Méta. Triez dessus pour trouver les stars méta de demain.',
    verWarn: 'Version FM {v} détectée ; la lecture est calibrée pour {s}.x. Données possiblement peu fiables avant une mise à jour de FMSuperScout.',
    verWarnOldDump: 'Ces données viennent d\'un ancien dump FMSuperScout. Tout fonctionne, mais cliquez sur Nouvelles données avec votre sauvegarde chargée.',
    metaWeightsLabel: 'Pondération méta', metaWeightsLoad: 'Charger un fichier…', metaWeightsReset: 'Réinitialiser',
    clearAllData: 'Effacer les données de scouting', clearAllDataConfirm: 'Supprimer les données enregistrées des joueurs et du staff, les listes de présélection et l’historique de progression de toutes les carrières ? Cette action est irréversible.', clearAllDataDone: 'Toutes les données de scouting ont été supprimées.', clearAllDataError: 'Impossible de supprimer les données de scouting.',
    billion: ' Md',
    bestxi_title: 'Meilleur XI & Banc (Doublures)',
    bestxi_autoFind: 'Trouver la meilleure compo', bestxi_editTactic: 'Modifier la tactique',
    bestxi_customOpt: '⚙️ Tactique Personnalisée (Interactive)',
    bestxi_noClub: 'Aucun club détecté. Sélectionnez une équipe via les filtres (Mon club).',
    bestxi_noPlayer: 'Aucun joueur', bestxi_vacantPost: 'Poste vacant',
    bestxi_bench: '🪑 Mon Banc (Doublures)', bestxi_left: '(Gauche)', bestxi_right: '(Droit)', bestxi_minProf: 'Maîtrise min. du poste',
    bestxi_avgScore: 'Score moyen Meta du XI :',
    bestxi_autoToast: 'Compo optimale : {f} ({s} moy.)',
    bestxi_autoFail: 'Impossible de trouver une formation', bestxi_autoNoClub: 'Aucun club sélectionné',
    bestxi_ignore: 'Exclure', bestxi_resetIgnored: 'Réintégrer tous', bestxi_ignored: 'Indisponibles',
    tabMyPlayers: 'Mon joueur', tabBestxi: 'Meilleur XI',
    tactic_title: 'Tactique Personnalisée ({n}/11 postes)', tactic_confirm: 'Confirmer la compo',
    tactic_maxStarters: 'Maximum 11 titulaires atteints.',
    clubs_noResults: 'Aucun club trouvé.',
  },
  de: {
    players: 'Spieler', staff: 'Mitarbeiter', shortlist: 'Shortlist', searchph: 'Name oder Verein…',
    settings: 'Einstellungen', langLabel: 'Sprache', curLabel: 'Währung',
    showHidden: 'Versteckte Werte anzeigen', showMeta: 'Meta-Score anzeigen',
    profileMode: 'Spielerprofil', profSide: 'Rechts', profPopup: 'Popup',
    devTitle: 'Entwicklung',
    cardBtnTip: 'Spielerkarte speichern (PNG)', cardSaved: 'Karte in Downloads gespeichert',
    donateBtn: 'FMSuperScout unterstützen',
    seasonTitle: 'Das war Saison {s}',
    seasonStatProfiles: '{n} Profile angesehen', seasonStatLoads: '{n}× Datenbank geladen',
    seasonStatCards: '{n} Spielerkarten geteilt', seasonStatShort: '{n} auf der Shortlist',
    seasonAsk: 'FMSuperScout hat die ganze Saison gratis mitgearbeitet. Ein Kaffee ist sein komplettes Jahresgehalt.',
    alreadyDonated: 'Schon gespendet?', neverAsk: 'Nicht mehr fragen',
    supporterThanks: 'Danke! Du hörst nichts mehr davon.',
    donateCta: '☕ Kaffee spendieren', donateLater: 'Später',
    position: 'Position', clear: 'leeren', staffrole: 'Mitarbeiterrolle', quality: 'Qualität & Alter',
    age: 'Alter', financial: 'Finanzen', maxvalue: 'Max. Wert', maxfee: 'Max. Forderung', maxwage: 'Max. Gehalt',
    esSetupTitle: 'Starte Football Manager 24 zuerst einmal',
    esSetupBody: 'Der erste Start nach der Installation dauert 1 bis 3 Minuten länger und zeigt ein schwarzes Konsolenfenster. Das ist normal: Die Mod-Ebene erzeugt einmalig ihre Dateien. Fenster offen lassen, auch wenn FM zu hängen scheint.',
    esSetupHint: 'Danach Spielstand laden und Nieuwe data drücken. Die nächsten Starts laufen wieder normal.',
    devDeltaHint: 'Veränderung im angezeigten Zeitraum: letzte Messung minus erste. Grün = Fortschritt, Rot = Rückschritt.',
    c_growth: 'Wachstum', grNew: 'neu', development: 'Entwicklung', histPeriod: 'Zeitraum',
    hp_last: 'Seit letztem Dump', hp_m6: 'Letzte 6 Monate', hp_y1: 'Letztes Jahr',
    hp_season: 'Diese Saison', hp_all: 'Seit Beginn', growthRange: 'Wachstum', onlyNew: 'Nur neue Spieler',
    growthHint: 'CA-Veränderung seit dem gewählten Stichtag, gemessen aus deinen eigenen Dumps. Grün = Wachstum, Rot = Verlust, "neu" = existierte damals noch nicht.\n\nJedes Nieuwe data fügt einen Messpunkt hinzu: Je länger du das Tool nutzt, desto weiter blickst du zurück.',
    onlyNewHint: 'Spieler, die es am Stichtag noch nicht gab. Meist Jugendspieler aus einer Intake, manchmal jemand aus einer nicht geladenen Liga.',
    intakeTitle: 'Jugend-Intake: {n} neue Spieler weltweit', intakeBest: 'Bestes Talent: {p}',
    intakeShow: 'Intake anzeigen',
    physical: 'Physis', heightCm: 'Größe (cm)', wonderkidOnly: 'Nur Wonderkids',
    wonderkidHint: 'Höchstens 21 Jahre, PA 150 oder mehr und mindestens 25 Punkte Luft (PA minus CA). Gleiche Schwelle wie der Goldrand auf der Spielerkarte.',
    origin: 'Herkunft', originComp: 'Herkunft & Liga', nat: 'Nationalität', euonly: 'Nur EU/EWR', availability: 'Verfügbarkeit',
    interestmin: 'Interesse ≥', all: 'Alle', attainable: 'Verfügbar', listed: 'Auf Transferliste',
    tstatus: 'Transferstatus', tsSale: 'Zu verkaufen', tsLoan: 'Zu verleihen', tsAny: 'Verkauf oder Leihe',
    attainHint: 'Kann er weg? Auf der Transferliste, angeboten, vereinslos oder Vertrag läuft binnen 12 Monaten aus (und nicht "unverkäuflich"). Sagt nichts darüber, ob er zu DIR will: das ist Interesse.',
    exp6: '< 6 Mon.', exp12: '< 1 Jahr', free: 'Vereinslos', myclub: 'Mein Verein', contractF: 'Vertrag',
    advBtn: 'Attributfilter', advTitle: 'Nach Attributen filtern', advSearch: 'Attribut wählen oder tippen…',
    advAdd: '+ Attribut', advClear: 'Leeren', advDone: 'Fertig', advMin: 'min', advMax: 'max', advColAttr: 'Attribut',
    reportBug: 'Problem melden…', esReportHint: 'Nieuwe data gedrückt, aber keine Daten?', updateAvail: 'Update {v} verfügbar',
    updDl: 'Update wird geladen… {pct}%', updVerify: 'Download wird geprüft…',
    updLaunch: 'Installer gestartet. Folge den Schritten; die App startet danach neu.',
    updErr: 'Update fehlgeschlagen. Downloadseite öffnen',
    updCheckBtn: 'Nach Updates suchen', updChecking: 'Suche…',
    updNone: 'Du bist aktuell (v{v})', updFound: 'Update {v} verfügbar, siehe Hinweis oben',
    updCheckErr: 'Prüfung fehlgeschlagen. Bist du online?',
    onlyshortlist: 'Nur Shortlist', clearfilters: 'Filter leeren', fetch: 'Neue Daten',
    nodata: 'Noch keine Daten geladen', exportcsv: 'Shortlist exportieren (CSV)', importfmf: 'FMF importieren', clearshortlist: 'Shortlist leeren', bulkadd: 'Zur Shortlist hinzufügen', bulkcancel: 'Auswahl abbrechen', bulkselected: '{n} ausgewählt', fmfNamePrompt: 'Name der Shortlist in FM24', fmfImportError: 'FMF-Import fehlgeschlagen', fmfImported: '{name}: {n} Spieler importiert', fmfMissing: '{n} Spieler nicht im Dump', fmfNoMatch: "FMF wurde gelesen, aber keine der {n} IDs ist in diesem Dump vorhanden. Die Spieler stammen moeglicherweise aus einem anderen Spielstand oder sind nicht mehr aktiv.", clearShortConfirm: '{n} Spieler aus der Shortlist entfernen?', syncfm: 'Liste aus FM24 holen', syncfound: '{n} Spieler aus FM24 geladen', syncmissing: 'Keine aktive Spielerliste in FM24 gefunden',
    results: 'Treffer', c_name: 'Name', c_age: 'Alter', c_pos: 'Position', c_club: 'Verein', c_nat: 'Nat',
    c_value: 'Wert', c_fee: "Gesch. Transferpreis", c_wage: 'Gehalt', c_expires: 'Vertrag bis', c_interest: 'Interesse',
    c_status: 'Status', c_role: 'Rolle', foot: 'Fuß', footR: 'Rechts', footL: 'Links', footB: 'Beide', height: 'Größe', repLabel: 'Reputation',
    c_clubrep: 'Vereinsrep.', c_worldrep: 'Weltrep.', c_div: 'Liga',
    coachAttTac: 'Angr · Takt', coachAttTech: 'Angr · Tech', coachDefTac: 'Abw · Takt', coachDefTech: 'Abw · Tech', coachPossTac: 'Ball · Takt', coachPossTech: 'Ball · Tech', coachFitStrength: 'Fit · Kraft', coachFitQuickness: 'Fit · Schn.', coachGkStop: 'TW · Paraden', coachGkHandleDist: 'TW · Fang/Abw.', coachSetPieces: 'Standards',
    staffTrainingStarsHint: 'Geschätzte FM24-Sterne nach einer Community-Formel, ohne Belastungskorrektur. DDM = Entschlossenheit + Disziplin + Motivation. 5 Sterne beginnen bei 271 Punkten; die Trainingsbelastung ist nicht berücksichtigt.',
    estval: 'Gesch. Wert', wageLabel: 'Gehalt', contractLabel: 'Vertrag bis', free_l: 'ablösefrei',
    int_big: 'Hoch', int_ok: 'Ordentlich', int_small: 'Gering', int_no: 'Nein', interestTitle: 'Interesse-Einschätzung',
    interestHint: 'Würde dieser Spieler zu deinem Verein wechseln? Geschätzt aus Reputationsunterschied, Gehalt, Ambition, Loyalität, Alter und Verfügbarkeit. FIFA-Artikel 19 gilt für Nicht-EU-Spieler unter 18.\n\nEine Schätzung, keine FM-Zahl: FM entscheidet erst in der Verhandlung und wägt dein Angebot mit. Ein "Gering" kann bei einem starken Angebot trotzdem Ja sagen.',
    minorNote: 'Zu jung für einen Transfer.', minorIntlNote: 'Als Nicht-EU-Minderjähriger erst ab 18 machbar (FIFA-Regel für internationale Transfers).',
    ambition: 'Ambition', loyalty: 'Loyalität', professionalism: 'Professionalität', adaptability: 'Anpassung',
    pressure: 'Druck', sportsmanship: 'Fairness', temperament: 'Temperament', controversy: 'Kontroverse', determination: 'Entschlossenheit',
    personaTitle: 'Persönlichkeit',
    hiddenTitle: 'Versteckte Merkmale', a_Consistency: 'Konstanz', a_ImportantMatches: 'Wichtige Spiele',
    a_InjuryProneness: 'Verletzungsanfälligkeit', a_Versatility: 'Vielseitigkeit', a_Dirtiness: 'Unfairness',
    showPot: 'Geschätztes Potenzial anzeigen', potNote: 'geschätzte Werte beim Potenzial (PA)',
    loanOut: 'verliehen an {c}', loanIn: 'ausgeliehen von {c}', ownerLabel: 'Stammverein',
    clubless: 'vereinslos', clubUnknown: 'unbekannter Verein', copied: 'Kopiert',
    copyNameTip: 'Klick = Name kopieren', slEmpty: 'Shortlist leer',
    copyBtnTip: 'Name kopieren', clubNotRead: 'Verein nicht ausgelesen (Rep {r})',
    reqSent: 'Spielerdaten werden gelesen…',
    dumping: 'Spielerdaten werden gelesen…', dumpReady: 'Neue Daten bereit, zum Laden klicken',
    dumpLoaded: 'Neue Daten geladen',
    dumpError: 'Auslesen fehlgeschlagen', fmNotRunning: 'Starte zuerst Football Manager 24 und lade deinen Spielstand.',
    dumpIncomplete: 'Der Dump ist unvollständig (FM24 war vermutlich noch beschäftigt). Versuche es gleich noch einmal.',
    reqNoPickup: 'FM24 nimmt die Anfrage nicht an. Spielstand geladen? Versuche Nieuwe data im Spiel oder starte FM24 neu.',
    reqNoPickupMore: 'Kommt das immer wieder? Lies den Fix',
    scanStalled: 'Der Scan scheint gestoppt (FM24 beendet oder abgestürzt?). Starte FM24 neu und versuche es erneut.',
    serverGone: 'Keine Verbindung zum lokalen Server. Schließe dieses Fenster und starte FMSuperScout neu.',
    tag_free: 'vereinslos', tag_listed: 'Transferliste', tag_loan: 'zu verleihen', tag_rel: 'freigestellt', tag_nfs: 'unverkäuflich',
    colHint: 'Ziehen zum Verschieben · Rechtsklick für Spalten', colsTitle: 'Spalten anzeigen', colsReset: 'Standard wiederherstellen',
    g_technical: 'Technik', g_setpieces: 'Standards', g_mental: 'Mental', g_physical: 'Physis', g_goalkeeping: 'Torwart', g_coaching: 'Coaching', g_knowledge: 'Wissen & Scouting', g_gkCoaching: 'Torwart-Coaching',
    staffAttrs: 'Mitarbeiter-Attribute',
    clearAll: 'alles leeren', chipSearch: 'Suchen',
    loading: 'Daten werden geladen…',
    parsing: 'Daten werden verarbeitet…',
    esErrTitle: 'Der Dump konnte nicht geladen werden',
    esErrBig: 'Auf der Festplatte liegt ein Dump, aber die App konnte ihn nicht lesen. Das passiert vor allem bei sehr großen Spielständen (viele Ligen gleichzeitig geladen). Melde es mit dem Button unten.',
    esErrSize: 'Dump auf Festplatte: {mb} MB',
    esErrReload: 'Erneut versuchen',
    esErrCrash: 'Der letzte Ladeversuch ist hängen geblieben, vermutlich wegen zu wenig freiem Speicher. Tipp: Schließe FM24 (der Dump liegt schon auf der Festplatte) und klicke dann auf Erneut versuchen.',
    step1: 'Starte <b>FM24</b> und lade deinen Spielstand',
    step2: 'Klicke hier auf <b>Neue Daten</b>',
    step3: 'Die Daten laden automatisch, sobald der Dump fertig ist',
    playersWord: 'Spieler', staffWord: 'Mitarbeiter', clickClubFilter: 'Klick = nach deinem Verein filtern', repWord: 'Reputation',
    roleFit: 'Taktische Rolle', roleColHdr: 'Rolle', roleAny: 'Keine Rolle gewählt', bestRoles: 'Beste Rollen', profThresholdLabel: 'Mind. Kompetenz',
    compare: 'Vergleichen', comparing: 'Vergleich', addCompare: 'Vergleichen', compareFull: 'Max. 3 Spieler',
    cmpTitle: 'Spielervergleich', cmpValue: 'Wert', cmpTopRole: 'Beste Rolle',
    cmpWinsBadge: '{n}× bestes Attribut', avgLabel: 'Durchschnitt',
    mt_all: 'Alle', mt_first: '1. Mannschaft', mt_res: 'Reserve', mt_youth: 'Jugend',
    cmpDeltaHint: 'Differenz: Spieler 1 minus Spieler 2 (grün = Vorteil Spieler 1)',
    analysis: 'Analyse', anTitle: 'Kaderbedarfsanalyse', anNoClub: 'Kein eigener Verein in den Daten gefunden.',
    anPlayers: 'Spieler', anPlayerTotal: 'Spieler gesamt', anLowest: 'Niedrig', anAverage: 'Ø', anHighest: 'Höchste', anAvgAge: 'Ø Alter', anAvgCa: 'Ø CA', anTopCa: 'beste CA',
    anOk: 'Gut besetzt', anThin: 'Dünn besetzt', anShort: 'Unterbesetzt', anAging: 'Überaltert', anNoSucc: 'Keine Nachfolge',
    anScout: 'Spieler scouten', anYoungTalent: 'jüngstes Talent', anNone: 'keins',
    anBiggestNeed: 'Größter Bedarf', anSquadSize: 'Kader',
    anRecAging: 'Überaltert; suche einen Nachfolger unter {age} mit PA über {pa}.',
    anRecShort: 'Zu wenige Spieler; verpflichte mindestens {n} weitere ({pa}+ PA).',
    anRecThin: 'Dünne Absicherung; ein Zugang mit {pa}+ PA stärkt die Tiefe.',
    anRecSucc: 'Kein junges Talent auf Niveau; suche einen U{age} mit PA über {pa}.',
    anRecAgingNp: 'Überaltert; suche einen jüngeren Nachfolger.',
    anRecShortNp: 'Zu wenige Spieler; verpflichte {n} weitere.',
    anRecThinNp: 'Dünne Absicherung; ein Zugang stärkt die Tiefe.',
    anRecSuccNp: 'Kein junges Talent auf Niveau; suche ein großes U{age}-Talent.',
    competition: 'Liga', divLabel: 'Liga', divSearch: 'Liga eintippen…',
    gameDateMemory: 'Datum im Spiel (aus dem Speicher)', gameDateDerived: 'Geschätztes Spieldatum (Jahr sicher, Tag angenähert)',
    presetsTitle: 'Gespeicherte Filter', presetSave: 'Aktuelle Filter speichern', presetNamePrompt: 'Name für diese Suche',
    presetSaved: 'Filter gespeichert', presetNone: 'Noch keine gespeicherten Filter.', presetPick: 'Gespeicherten Filter wählen…',
    presetDelConfirm: '"{name}" wirklich löschen?',
    presetEmptyFilters: 'Keine aktiven Filter zum Speichern',
    presetSaveTitle: 'Filter speichern', presetDelTitle: 'Filter löschen',
    saveBtn: 'Speichern', deleteBtn: 'Löschen', cancelBtn: 'Abbrechen',
    scanDb: 'Datenbank', dbMen: 'Männer', dbWomen: 'Frauen', dbBoth: 'Beide',
    genderLabel: 'Geschlecht', womenNote: 'Gilt ab dem nächsten Scan (Nieuwe data)',
    scanDbHint: 'Wähle, welches Geschlecht der nächste Scan (Nieuwe data) lädt: nur Männer, nur Frauen oder beide. Bei Beide erscheint ein Geschlechtsfilter in der Seitenleiste.',
    wagePer: 'Gehalt pro', perWeek: 'Woche', perMonth: 'Monat', perYear: 'Jahr',
    perWeekSuf: '/Wo', perMonthSuf: '/Mon.', perYearSuf: '/Jahr', jobStaff: 'Mitarbeiter',
    c_meta: 'Meta', metaLabel: 'Meta-Score', c_metapa: 'PA-Meta',
    metaViewLabel: 'Meta für Position anzeigen...', metaViewBest: 'Beste (auto)',
    metaHint: 'Gewichteter Durchschnitt (1-20) der Attribute, die laut FM-Arenas Match-Engine-Tests Spiele gewinnen; Schnelligkeit und Antritt zählen mit Abstand am meisten. Torhüter: eigene Gewichtung aus dem Torwart-Test (Reflexe, Beweglichkeit).\n\n15+ Elite, 13-15 stark, 11-13 solide. Bei gleicher CA spielt der höhere Meta meist besser.',
    metaPaHint: 'Dieselbe Meta-Gewichtung, angewandt auf die Attribute, die er an seinem Potenzial (PA) voraussichtlich erreicht. Die Projektion folgt dem Wachstumsprofil seiner Positionsgruppe; Physis wächst nach 23 nicht mehr.\n\nAusentwickelt = gleich Meta. Sortiere danach für die Meta-Stars von morgen.',
    verWarn: 'FM-Version {v} erkannt; das Auslesen ist auf {s}.x geeicht. Daten bis zu einem FMSuperScout-Update möglicherweise unzuverlässig.',
    verWarnOldDump: 'Diese Daten stammen aus einem älteren FMSuperScout-Dump. Alles funktioniert, aber klicke mit geladenem Spielstand auf Neue Daten.',
    metaWeightsLabel: 'Meta-Gewichtung', metaWeightsLoad: 'Datei laden…', metaWeightsReset: 'Standard wiederherstellen',
    clearAllData: 'Scouting-Daten löschen', clearAllDataConfirm: 'Gespeicherte Spieler- und Mitarbeiterdaten, Shortlists und Entwicklungsverläufe für alle Karrieren löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.', clearAllDataDone: 'Alle gespeicherten Scouting-Daten wurden gelöscht.', clearAllDataError: 'Gespeicherte Scouting-Daten konnten nicht gelöscht werden.',
    billion: ' Mrd.',
    bestxi_title: 'Bestes XI & Bank (Ersatz)',
    bestxi_autoFind: 'Beste Aufstellung finden', bestxi_editTactic: 'Taktik bearbeiten',
    bestxi_customOpt: '⚙️ Benutzerdefinierte Taktik (Interaktiv)',
    bestxi_noClub: 'Kein Verein erkannt. Wähle ein Team über die Filter (Mein Verein).',
    bestxi_noPlayer: 'Kein Spieler', bestxi_vacantPost: 'Freie Position',
    bestxi_bench: '🪑 Meine Bank (Ersatz)', bestxi_left: '(Links)', bestxi_right: '(Rechts)', bestxi_minProf: 'Mindestpositionskenntnis',
    bestxi_avgScore: 'Durchschnittlicher XI-Meta-Score:',
    bestxi_autoToast: 'Optimale Aufstellung: {f} ({s} Ø)',
    bestxi_autoFail: 'Keine Aufstellung gefunden', bestxi_autoNoClub: 'Kein Verein ausgewählt',
    bestxi_ignore: 'Ignorieren', bestxi_resetIgnored: 'Alle reaktivieren', bestxi_ignored: 'Nicht verfügbar',
    tabMyPlayers: 'Mein Spieler', tabBestxi: 'Bestes XI',
    tactic_title: 'Benutzerdefinierte Taktik ({n}/11 Positionen)', tactic_confirm: 'Aufstellung bestätigen',
    tactic_maxStarters: 'Maximum 11 Startspieler erreicht.',
    clubs_noResults: 'Keine Vereine gefunden.',
  },
};
// Labels added by the shortlist tools are kept in the same global translation
// tables as the rest of the interface, so no feature-specific language leaks
// into another locale.
const NEW_I18N = {
  nl: {
    exportfmf: 'Shortlist exporteren (FMF)', exportedCsv: '{n} spelers geëxporteerd naar CSV', fmfExported: '{n} spelers geëxporteerd naar FMF',
    bulkAdded: '{n} spelers toegevoegd', bulkremove: 'Uit shortlist verwijderen', bulkRemoved: '{n} spelers verwijderd', shortlistCleared: 'Shortlist gewist',
    fmfExportError: 'FMF exporteren mislukt', fmfSavePickerUnsupported: 'Deze browser ondersteunt kiezen waar je het FMF-bestand opslaat niet. Start de app in het Edge-appvenster.', syncError: 'FM24: {error}', syncTimeout: 'Time-out bij het lezen van de FM24-shortlist',
    weightsCopied: 'Wegingen naar alle veldspelergroepen gekopieerd', filtersTitle: 'Filters', fetchHint: 'Vraag FM om een nieuwe dump', reloadHint: 'Laatste dump opnieuw laden', syncHint: 'Open eerst FM24 > Scouting > Shortlist', settingsTitle: 'Instellingen', natExample: 'Nederland', close: 'Sluiten', metaWeightsEdit: 'Gewichten bewerken', presetLoadError: 'Preset laden mislukt', presetInvalidFile: 'Ongeldig preset-bestand',
    removeSegment: 'Segment verwijderen', doubleSlope: 'Helling verdubbelen ten opzichte van het vorige segment', halveSlope: 'Helling halveren ten opzichte van het vorige segment', addSegment: 'Segment hieronder toevoegen', addProficiency: 'Vaardigheidssegment toevoegen',
    vsTitle: 'Shortlist vergelijken', vsDescription: 'Vergelijk je huidige selectie met spelers op de shortlist, per positie.', vsFormation: 'Formatie', vsFormationHint: 'Pas de formatie aan via Beste XI.', vsSort: 'Sorteren', vsTeamFilter: 'Teams', vsLayoutSide: 'Naast elkaar', vsLayoutStack: 'Onder elkaar',
    weightHow: 'ℹ️ Zo werken de gewichten (uitklappen)', weightPtsIntro: 'puntenverbetering gemeten met de FM-Arena-testmethode: verhoog één attribuut over het opgegeven bereik bij', weightTestPlayers: '10 testspelers', weightPtsMeasure: 'en meet de gewonnen punten over een', weightSeason: 'seizoen van 38 wedstrijden', weightPiecewise: 'Stuksgewijze segmenten', weightPiecewiseIntro: 'klik op', weightPiecewiseEnd: 'bij een attribuut om eronder een tweede segment toe te voegen — het breekpunt is de FROM-waarde van het bovenste segment. Plafond (20) en vloer (1) liggen vast.', weightScale: 'schaal', weightNegativePts: 'Negatieve PTS', weightAllowed: 'zijn toegestaan (bijv.', weightProficiency: 'vaardigheid', weightNatural: 'Natural', weightPenalty: 'de straf', weightDoublesBelow: 'verdubbelt onder Accomplished', weightCurrentCoeff: 'Huidige coeff_prof', weightBaseline: 'Baseline', weightPlayerAt: 'speler met elk attribuut op', weightEffective: 'effectieve meta', weightSameNatural: 'dezelfde speler met Natural-vaardigheid', weightAttribute: 'ATTRIBUUT', weightPts: 'PTS', weightFromTo: 'FROM → TO', weightCoeff: 'COEFF', weightProficiencyTitle: 'Vaardigheid', weightProfLevels: '(Natural=20, Accomplished=15, Promising=10)', weightEditorTitle: '⚙️ Meta Weight Editor — {name}', weightCopyOutfield: '↓ Kopiëren naar alle veldspelergroepen', weightDownloadJson: '⬇ JSON downloaden', weightApplyClose: '✓ Toepassen & sluiten', weightCancel: 'Annuleren', weightDefaultPreset: 'Direct', weightScaleDefault: '10 ({outfield}), 1 ({goalkeeper})', weightOutfield: 'veldspelers', weightGoalkeeper: 'keepers', weightBelow: '×2 onder {n}', weightSame: '≈ gelijk',
    weTechnical: 'Technisch', weMental: 'Mentaal', wePhysical: 'Fysiek', weHidden: 'Verborgen', weGoalkeeping: 'Keepen',
  },
  en: {
    exportfmf: 'Export shortlist (FMF)', exportedCsv: '{n} players exported to CSV', fmfExported: '{n} players exported to FMF',
    bulkAdded: '{n} players added', bulkremove: 'Remove from shortlist', bulkRemoved: '{n} players removed', shortlistCleared: 'Shortlist cleared',
    fmfExportError: 'FMF export failed', fmfSavePickerUnsupported: 'This browser cannot choose where to save the FMF file. Start the app in its Edge app window.', syncError: 'FM24: {error}', syncTimeout: 'Timed out reading the FM24 shortlist',
    weightsCopied: 'Weights copied to all outfield groups', filtersTitle: 'Filters', fetchHint: 'Request a new dump from FM', reloadHint: 'Reload the latest dump', syncHint: 'Open FM24 > Scouting > Shortlist first', settingsTitle: 'Settings', natExample: 'Netherlands', close: 'Close', metaWeightsEdit: 'Edit weights', presetLoadError: 'Preset failed to load', presetInvalidFile: 'Invalid preset file',
    removeSegment: 'Remove segment', doubleSlope: 'Double slope vs segment above', halveSlope: 'Halve slope vs segment above', addSegment: 'Add segment below', addProficiency: 'Add proficiency segment',
    vsTitle: 'Compare shortlist', vsDescription: 'Compare your current squad with shortlisted players by position.', vsFormation: 'Formation', vsFormationHint: 'Change the formation in Best XI.', vsSort: 'Sort', vsTeamFilter: 'Teams', vsLayoutSide: 'Show side by side', vsLayoutStack: 'Stack vertically',
    weightHow: 'ℹ️ How weights work (expand)', weightPtsIntro: 'points improvement measured by the FM-Arena testing method: raise one attribute across the specified range across', weightTestPlayers: '10 test players', weightPtsMeasure: 'and measure the points gained over a', weightSeason: '38-match season', weightPiecewise: 'Piecewise segments', weightPiecewiseIntro: 'click', weightPiecewiseEnd: 'on any attribute to add a second segment below — the breakpoint is the FROM value of the upper segment. Ceiling (20) and floor (1) are fixed.', weightScale: 'scale', weightNegativePts: 'Negative PTS', weightAllowed: 'are allowed (e.g.', weightProficiency: 'proficiency', weightNatural: 'Natural', weightPenalty: 'the penalty', weightDoublesBelow: 'doubles below Accomplished', weightCurrentCoeff: 'Current coeff_prof', weightBaseline: 'Baseline', weightPlayerAt: 'player with every attribute at', weightEffective: 'effective_meta', weightSameNatural: 'the same player at Natural proficiency', weightAttribute: 'ATTRIBUTE', weightPts: 'PTS', weightFromTo: 'FROM → TO', weightCoeff: 'COEFF', weightProficiencyTitle: 'Proficiency', weightProfLevels: '(Natural=20, Accomplished=15, Promising=10)', weightEditorTitle: '⚙️ Meta Weight Editor — {name}', weightCopyOutfield: '↓ Copy to all outfield groups', weightDownloadJson: '⬇ Download JSON', weightApplyClose: '✓ Apply & Close', weightCancel: 'Cancel', weightDefaultPreset: 'Direct', weightScaleDefault: '10 ({outfield}), 1 ({goalkeeper})', weightOutfield: 'outfield', weightGoalkeeper: 'goalkeepers', weightBelow: '×2 below {n}', weightSame: '≈ same',
    weTechnical: 'Technical', weMental: 'Mental', wePhysical: 'Physical', weHidden: 'Hidden', weGoalkeeping: 'Goalkeeping',
  },
  fr: {
    exportfmf: 'Exporter la shortlist (FMF)', exportedCsv: '{n} joueurs exportés en CSV', fmfExported: '{n} joueurs exportés en FMF',
    bulkAdded: '{n} joueurs ajoutés', bulkremove: 'Retirer de la shortlist', bulkRemoved: '{n} joueurs retirés', shortlistCleared: 'Shortlist effacée',
    fmfExportError: 'Échec de l’export FMF', fmfSavePickerUnsupported: 'Ce navigateur ne permet pas de choisir où enregistrer le fichier FMF. Ouvrez l’application dans la fenêtre Edge.', syncError: 'FM24 : {error}', syncTimeout: 'Délai dépassé lors de la lecture de la shortlist FM24',
    weightsCopied: 'Pondérations copiées vers tous les groupes de joueurs de champ', filtersTitle: 'Filtres', fetchHint: 'Demander un nouveau dump à FM', reloadHint: 'Recharger le dernier dump', syncHint: 'Ouvrez d’abord la liste des joueurs intéressés dans FM24', settingsTitle: 'Paramètres', natExample: 'Pays-Bas', close: 'Fermer', metaWeightsEdit: 'Modifier les pondérations', presetLoadError: 'Échec du chargement du preset', presetInvalidFile: 'Fichier de preset invalide',
    removeSegment: 'Supprimer le segment', doubleSlope: 'Doubler la pente par rapport au segment précédent', halveSlope: 'Réduire de moitié la pente par rapport au segment précédent', addSegment: 'Ajouter un segment dessous', addProficiency: 'Ajouter un segment de maîtrise',
    vsTitle: 'Comparer la shortlist', vsDescription: 'Comparez votre effectif actuel aux joueurs de la shortlist, par poste.', vsFormation: 'Formation', vsFormationHint: 'Modifiez la formation dans Meilleur XI.', vsSort: 'Trier', vsTeamFilter: 'Équipes', vsLayoutSide: 'Afficher côte à côte', vsLayoutStack: 'Empiler verticalement',
    weightHow: 'ℹ️ Fonctionnement des pondérations (déplier)', weightPtsIntro: 'amélioration en points mesurée avec la méthode de test FM-Arena : augmenter un attribut sur la plage indiquée pour', weightTestPlayers: '10 joueurs test', weightPtsMeasure: 'puis mesurer les points gagnés sur une', weightSeason: 'saison de 38 matchs', weightPiecewise: 'Segments par morceaux', weightPiecewiseIntro: 'cliquez sur', weightPiecewiseEnd: 'pour ajouter un second segment sous un attribut — le point de rupture est la valeur FROM du segment supérieur. Le plafond (20) et le plancher (1) sont fixes.', weightScale: 'échelle', weightNegativePts: 'Les PTS négatifs', weightAllowed: 'sont autorisés (par ex.', weightProficiency: 'maîtrise', weightNatural: 'Naturel', weightPenalty: 'la pénalité', weightDoublesBelow: 'double sous Accompli', weightCurrentCoeff: 'Coeff_prof actuel', weightBaseline: 'Référence', weightPlayerAt: 'joueur avec chaque attribut à', weightEffective: 'meta_effective', weightSameNatural: 'le même joueur avec une maîtrise Naturel', weightAttribute: 'ATTRIBUT', weightPts: 'PTS', weightFromTo: 'DEPUIS → VERS', weightCoeff: 'COEFF.', weightProficiencyTitle: 'Maîtrise', weightProfLevels: '(Naturel=20, Accompli=15, Prometteur=10)', weightEditorTitle: '⚙️ Éditeur de pondérations Meta — {name}', weightCopyOutfield: '↓ Copier vers tous les groupes de joueurs de champ', weightDownloadJson: '⬇ Télécharger le JSON', weightApplyClose: '✓ Appliquer et fermer', weightCancel: 'Annuler', weightDefaultPreset: 'Direct', weightScaleDefault: '10 ({outfield}), 1 ({goalkeeper})', weightOutfield: 'joueurs de champ', weightGoalkeeper: 'gardiens', weightBelow: '×2 sous {n}', weightSame: '≈ identique',
    weTechnical: 'Technique', weMental: 'Mental', wePhysical: 'Physique', weHidden: 'Caché', weGoalkeeping: 'Gardien',
  },
  de: {
    exportfmf: 'Shortlist exportieren (FMF)', exportedCsv: '{n} Spieler als CSV exportiert', fmfExported: '{n} Spieler als FMF exportiert',
    bulkAdded: '{n} Spieler hinzugefügt', bulkremove: 'Aus Shortlist entfernen', bulkRemoved: '{n} Spieler entfernt', shortlistCleared: 'Shortlist geleert',
    fmfExportError: 'FMF-Export fehlgeschlagen', fmfSavePickerUnsupported: 'Dieser Browser kann den Speicherort für die FMF-Datei nicht auswählen. Starte die App im Edge-Appfenster.', syncError: 'FM24: {error}', syncTimeout: 'Zeitüberschreitung beim Lesen der FM24-Shortlist',
    weightsCopied: 'Gewichtungen in alle Feldspielergruppen kopiert', filtersTitle: 'Filter', fetchHint: 'Neuen Dump von FM anfordern', reloadHint: 'Letzten Dump neu laden', syncHint: 'Öffne zuerst die Liste interessierter Spieler in FM24', settingsTitle: 'Einstellungen', natExample: 'Niederlande', close: 'Schließen', metaWeightsEdit: 'Gewichtungen bearbeiten', presetLoadError: 'Preset konnte nicht geladen werden', presetInvalidFile: 'Ungültige Preset-Datei',
    removeSegment: 'Segment entfernen', doubleSlope: 'Steigung gegenüber dem vorherigen Segment verdoppeln', halveSlope: 'Steigung gegenüber dem vorherigen Segment halbieren', addSegment: 'Segment darunter hinzufügen', addProficiency: 'Fertigkeitssegment hinzufügen',
    vsTitle: 'Shortlist vergleichen', vsDescription: 'Vergleiche deinen aktuellen Kader mit Spielern auf der Shortlist nach Position.', vsFormation: 'Aufstellung', vsFormationHint: 'Ändere die Aufstellung bei Bestes XI.', vsSort: 'Sortieren', vsTeamFilter: 'Teams', vsLayoutSide: 'Nebeneinander anzeigen', vsLayoutStack: 'Untereinander anzeigen',
    weightHow: 'ℹ️ So funktionieren die Gewichtungen (aufklappen)', weightPtsIntro: 'Punkteverbesserung nach der FM-Arena-Testmethode: ein Attribut über den angegebenen Bereich bei', weightTestPlayers: '10 Testspielern', weightPtsMeasure: 'anheben und die gewonnenen Punkte über eine', weightSeason: '38-Spiele-Saison', weightPiecewise: 'Abschnittssegmente', weightPiecewiseIntro: 'Klicke auf', weightPiecewiseEnd: 'bei einem Attribut, um darunter ein zweites Segment hinzuzufügen — der Grenzwert ist der FROM-Wert des oberen Segments. Obergrenze (20) und Untergrenze (1) sind fest.', weightScale: 'Skala', weightNegativePts: 'Negative PTS', weightAllowed: 'sind erlaubt (z. B.', weightProficiency: 'Kompetenz', weightNatural: 'Natural', weightPenalty: 'die Strafe', weightDoublesBelow: 'verdoppelt sich unter Accomplished', weightCurrentCoeff: 'Aktueller coeff_prof', weightBaseline: 'Basiswert', weightPlayerAt: 'Spieler mit jedem Attribut auf', weightEffective: 'effektive_meta', weightSameNatural: 'derselbe Spieler mit Natural-Kompetenz', weightAttribute: 'ATTRIBUT', weightPts: 'PTS', weightFromTo: 'VON → BIS', weightCoeff: 'KOEFF.', weightProficiencyTitle: 'Kompetenz', weightProfLevels: '(Natural=20, Accomplished=15, Promising=10)', weightEditorTitle: '⚙️ Meta-Gewicht-Editor — {name}', weightCopyOutfield: '↓ In alle Feldspielergruppen kopieren', weightDownloadJson: '⬇ JSON herunterladen', weightApplyClose: '✓ Anwenden & schließen', weightCancel: 'Abbrechen', weightDefaultPreset: 'Direct', weightScaleDefault: '10 ({outfield}), 1 ({goalkeeper})', weightOutfield: 'Feldspieler', weightGoalkeeper: 'Torhüter', weightBelow: '×2 unter {n}', weightSame: '≈ gleich',
    weTechnical: 'Technik', weMental: 'Mental', wePhysical: 'Physis', weHidden: 'Verborgen', weGoalkeeping: 'Torwart',
  },
};
// Keep the FM proficiency terms localized too; they are part of the editor UI,
// not data identifiers.
Object.assign(NEW_I18N.nl, {
  weightNatural: 'Natuurlijk', weightDoublesBelow: 'verdubbelt onder Ervaren',
  weightBaseline: 'Basiswaarde', weightSameNatural: 'dezelfde speler met Natuurlijk-vaardigheid',
  weightProfLevels: '(Natuurlijk=20, Ervaren=15, Veelbelovend=10)',
  weightEditorTitle: '⚙️ Meta-gewichten bewerken — {name}', weightFromTo: 'VAN → TOT',
  weightPiecewiseEnd: 'bij een attribuut om eronder een tweede segment toe te voegen — het breekpunt is de VAN-waarde van het bovenste segment. Plafond (20) en vloer (1) liggen vast.',
});
Object.assign(NEW_I18N.de, {
  weightNatural: 'Natürlich', weightDoublesBelow: 'verdoppelt sich unter Erfahren',
  weightSameNatural: 'derselbe Spieler mit Natürlich-Kompetenz',
  weightProfLevels: '(Natürlich=20, Erfahren=15, Vielversprechend=10)',
  weightEditorTitle: '⚙️ Meta-Gewichtseditor — {name}',
  weightPiecewiseEnd: 'bei einem Attribut, um darunter ein zweites Segment hinzuzufügen — der Grenzwert ist der VON-Wert des oberen Segments. Obergrenze (20) und Untergrenze (1) sind fest.',
});
for (const [lang, labels] of Object.entries(NEW_I18N)) Object.assign(I18N[lang], labels);
Object.assign(I18N.nl, {
  tabClubList: 'Club', clubListTitle: 'Clubs', clubListSearch: 'Zoek clubs, land of competitie', clubListCount: '{n} clubs', clubListMissingLegend: '— betekent: niet beschikbaar in deze dump', clubDataMissing: 'Niet beschikbaar in deze dump',
  clubColName: 'Club', clubColNation: 'Land', clubColLeague: 'Competitie', clubColReputation: 'Reputatie',
  clubColTransferBudget: 'Transferbudget', clubColTransferRemaining: 'Transfer resterend',
  clubColWageBudget: 'Salarisbudget', clubColWageRemaining: 'Salaris resterend',
  clubColTrainingFacilities: 'Trainingsfaciliteiten', clubColYouthTrainingFacilities: 'Jeugdtrainingsfaciliteiten',
  clubColYouthRecruitment: 'Jeugdrekruteringsnetwerk', clubColJuniorCoaching: 'Juniorcoaching',
});
Object.assign(I18N.en, {
  tabClubList: 'Club', clubListTitle: 'Clubs', clubListSearch: 'Search clubs, nation or league', clubListCount: '{n} clubs', clubListMissingLegend: '— means data is not available in this dump', clubDataMissing: 'Not available in this dump',
  clubColName: 'Club', clubColNation: 'Nation', clubColLeague: 'League', clubColReputation: 'Reputation',
  clubColTransferBudget: 'Transfer budget', clubColTransferRemaining: 'Transfer remaining',
  clubColWageBudget: 'Wage budget', clubColWageRemaining: 'Wage remaining',
  clubColTrainingFacilities: 'Training facilities', clubColYouthTrainingFacilities: 'Youth training facilities',
  clubColYouthRecruitment: 'Youth recruitment network', clubColJuniorCoaching: 'Junior coaching',
});
Object.assign(I18N.fr, {
  tabClubList: 'Club', clubListTitle: 'Clubs', clubListSearch: 'Rechercher un club, un pays ou une ligue', clubListCount: '{n} clubs', clubListMissingLegend: '— signifie que cette donnée manque dans l’extraction', clubDataMissing: 'Indisponible dans cette extraction',
  clubColName: 'Club', clubColNation: 'Pays', clubColLeague: 'Ligue', clubColReputation: 'Réputation',
  clubColTransferBudget: 'Budget transfert', clubColTransferRemaining: 'Transferts restants',
  clubColWageBudget: 'Budget salarial', clubColWageRemaining: 'Masse salariale restante',
  clubColTrainingFacilities: 'Installations d’entraînement', clubColYouthTrainingFacilities: 'Installations de formation',
  clubColYouthRecruitment: 'Réseau de recrutement des jeunes', clubColJuniorCoaching: 'Encadrement des jeunes',
});
Object.assign(I18N.de, {
  tabClubList: 'Verein', clubListTitle: 'Vereine', clubListSearch: 'Vereine, Land oder Liga suchen', clubListCount: '{n} Vereine', clubListMissingLegend: '— bedeutet: in diesem Dump nicht verfügbar', clubDataMissing: 'In diesem Dump nicht verfügbar',
  clubColName: 'Verein', clubColNation: 'Land', clubColLeague: 'Liga', clubColReputation: 'Reputation',
  clubColTransferBudget: 'Transferbudget', clubColTransferRemaining: 'Transfer verbleibend',
  clubColWageBudget: 'Gehaltsbudget', clubColWageRemaining: 'Gehalt verbleibend',
  clubColTrainingFacilities: 'Trainingseinrichtungen', clubColYouthTrainingFacilities: 'Jugendeinrichtungen',
  clubColYouthRecruitment: 'Jugendrekrutierungsnetzwerk', clubColJuniorCoaching: 'Juniorentraining',
});
Object.assign(I18N.nl, {
  staffRecruitableOnly: 'Niet-aanwerfbare staf verbergen',
  clubColBalance: 'Saldo', clubColWageUsed: 'Salaris gebruikt',
  clubFilterToggle: 'Clubfilters', clubFilterName: 'Clubnaam', clubFilterNation: 'Land', clubFilterLeague: 'Competitie',
  clubFilterSearchName: 'Zoek club', clubFilterSearchNation: 'Zoek land', clubFilterSearchLeague: 'Zoek competitie',
  clubFilterMin: 'Min', clubFilterMax: 'Max', clubFilterReset: 'Filters wissen',
});
Object.assign(I18N.en, {
  staffRecruitableOnly: 'Hide non-recruitable staff',
  clubColBalance: 'Balance', clubColWageUsed: 'Wage used',
  clubFilterToggle: 'Club filters', clubFilterName: 'Club name', clubFilterNation: 'Nation', clubFilterLeague: 'League',
  clubFilterSearchName: 'Search club', clubFilterSearchNation: 'Search nation', clubFilterSearchLeague: 'Search league',
  clubFilterMin: 'Min', clubFilterMax: 'Max', clubFilterReset: 'Reset filters',
});
Object.assign(I18N.fr, {
  staffRecruitableOnly: 'Masquer le staff non recrutable',
  clubColBalance: 'Solde', clubColWageUsed: 'Masse salariale utilisée',
  clubFilterToggle: 'Filtres des clubs', clubFilterName: 'Club', clubFilterNation: 'Pays', clubFilterLeague: 'Ligue',
  clubFilterSearchName: 'Rechercher un club', clubFilterSearchNation: 'Rechercher un pays', clubFilterSearchLeague: 'Rechercher une ligue',
  clubFilterMin: 'Min', clubFilterMax: 'Max', clubFilterReset: 'Effacer les filtres',
});
Object.assign(I18N.de, {
  staffRecruitableOnly: 'Nicht verpflichtbares Personal ausblenden',
  clubColBalance: 'Kontostand', clubColWageUsed: 'Verwendetes Gehaltsbudget',
  clubFilterToggle: 'Clubfilter', clubFilterName: 'Verein', clubFilterNation: 'Land', clubFilterLeague: 'Liga',
  clubFilterSearchName: 'Verein suchen', clubFilterSearchNation: 'Land suchen', clubFilterSearchLeague: 'Liga suchen',
  clubFilterMin: 'Min', clubFilterMax: 'Max', clubFilterReset: 'Filter zurücksetzen',
});
// Onbekende taalcode (oude versie in localStorage, gesynct profiel) mag de app niet
// slopen vóór er ook maar iets gerenderd is → altijd via een geldige tabel.
const t = k => ((I18N[state.lang] || I18N.en)[k] ?? I18N.en[k] ?? I18N.nl[k] ?? k);
// Locale voor getallen/datums per app-taal (toLocaleString/-DateString).
const LOCALES = { nl: 'nl-NL', en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
const uiLocale = () => LOCALES[state.lang] || 'en-GB';

// ================= SVG-iconen =================
// Eén stijl (stroke, currentColor) die aansluit bij de bestaande UI-iconen; geen emoji.
// Uitzondering: het koffie-icoon (☕) blijft bewust een emoji.
const ICON_PATHS = {
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  compare: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  card: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  // Voetbal: gevulde vijfhoek in het midden, vijf dunne naden naar de rand en korte
  // hints van de randvlakken. Bewust een eigen, dunne lijndikte (1.1): met dikke naden
  // leest dit als een stuurwiel in plaats van een bal (varianten vergeleken 26-07).
  ball: '<g stroke-width="1.1"><circle cx="12" cy="12" r="10.2"/><path d="M12 8.8 12 1.8 M15.1 11.05 21.7 8.9 M13.9 14.7 18 20.4 M10.1 14.7 6 20.4 M8.9 11.05 2.3 8.9 M4.6 17.2 7.4 16.4 M19.4 17.2 16.6 16.4 M6 4.5 8.2 6.3 M18 4.5 15.8 6.3"/></g><polygon points="12,8.8 15.1,11.05 13.9,14.7 10.1,14.7 8.9,11.05" fill="currentColor" stroke="none"/>',
};
const icon = (name, size = 14) =>
  `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
// Shortlist-ster: vulling stuurt CSS aan via .on op de omliggende cel/knop.
const starSvg = (size = 15) =>
  `<svg class="ic star-ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96z"/></svg>`;
// Banner/waarschuwing: icoon + veilig ge-escapete tekst (tekst kan data uit de dump bevatten).
const bannerMsg = (ico, txt) => icon(ico, 13) + ' ' + escHtml(txt);
// Banner met echte voortgangsbalk (frac 0..1): plugin-scanvoortgang of download-voortgang.
const bannerProgress = (ico, txt, frac) => {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  return `${bannerMsg(ico, txt)} <span class="pbar"><span class="pfill" style="width:${pct}%"></span></span> <span class="ppct">${pct}%</span>`;
};

// ================= attributen =================
// Volgorde bepaalt de 2-koloms paring: Technisch|Mentaal boven, Fysiek|Standaardsituaties eronder
// (lange groepen samen, korte groepen samen → minder loze ruimte).
const ATTR_GROUPS_OUTFIELD = [
  ['g_technical', ['Crossing', 'Dribbling', 'Finishing', 'FirstTouch', 'Heading', 'LongShots', 'Marking', 'Passing', 'Tackling', 'Technique']],
  ['g_mental', ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision', 'WorkRate']],
  ['g_physical', ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength']],
  ['g_setpieces', ['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']],
];
const ATTR_GROUPS_GK = [
  ['g_goalkeeping', ['AerialReach', 'CommandOfArea', 'Communication', 'Eccentricity', 'FirstTouch', 'Handling', 'Kicking', 'OneOnOnes', 'Passing', 'Punching', 'Reflexes', 'RushingOut', 'Throwing', 'Technique']],
  ['g_mental', ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision', 'WorkRate']],
  ['g_physical', ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength']],
  ['g_setpieces', ['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']],
];
const ATTR_LABEL = {
  nl: {
    Corners: 'Hoekschoppen', Crossing: 'Voorzetten', Dribbling: 'Dribbelen', Finishing: 'Afwerken', FirstTouch: 'Eerste balcontact', FreeKicks: 'Vrije trappen', Heading: 'Koppen', LongShots: 'Afstandsschoten', LongThrows: 'Verre inworpen', Marking: 'Mandekking', Passing: 'Passing', PenaltyTaking: 'Strafschoppen', Tackling: 'Tackelen', Technique: 'Techniek',
    Aggression: 'Felheid', Anticipation: 'Anticiperen', Bravery: 'Lef', Composure: 'Kalmte', Concentration: 'Concentratie', Decisions: 'Beslissingen', Determination: 'Vastberadenheid', Flair: 'Flair', Leadership: 'Leiderschap', OffTheBall: 'Zonder bal', Positioning: 'Positie kiezen', Teamwork: 'Teamgeest', Vision: 'Inzicht', WorkRate: 'Inzet',
    Acceleration: 'Versnelling', Agility: 'Behendigheid', Balance: 'Evenwicht', JumpingReach: 'Sprongkracht', NaturalFitness: 'Natuurlijke fitheid', Pace: 'Snelheid', Stamina: 'Uithoudingsvermogen', Strength: 'Kracht',
    AerialReach: 'Uitreiken', CommandOfArea: 'Beheersing strafschopgebied', Communication: 'Communicatie', Eccentricity: 'Excentriciteit', Handling: 'Vangen', Kicking: 'Uittrappen', OneOnOnes: 'Één tegen één', Punching: 'Stompen', Reflexes: 'Reflexen', RushingOut: 'Uitkomen', Throwing: 'Uitwerpen',
  },
  en: {
    Corners: 'Corners', Crossing: 'Crossing', Dribbling: 'Dribbling', Finishing: 'Finishing', FirstTouch: 'First Touch', FreeKicks: 'Free Kicks', Heading: 'Heading', LongShots: 'Long Shots', LongThrows: 'Long Throws', Marking: 'Marking', Passing: 'Passing', PenaltyTaking: 'Penalty Taking', Tackling: 'Tackling', Technique: 'Technique',
    Aggression: 'Aggression', Anticipation: 'Anticipation', Bravery: 'Bravery', Composure: 'Composure', Concentration: 'Concentration', Decisions: 'Decisions', Determination: 'Determination', Flair: 'Flair', Leadership: 'Leadership', OffTheBall: 'Off the Ball', Positioning: 'Positioning', Teamwork: 'Teamwork', Vision: 'Vision', WorkRate: 'Work Rate',
    Acceleration: 'Acceleration', Agility: 'Agility', Balance: 'Balance', JumpingReach: 'Jumping Reach', NaturalFitness: 'Natural Fitness', Pace: 'Pace', Stamina: 'Stamina', Strength: 'Strength',
    AerialReach: 'Aerial Reach', CommandOfArea: 'Command of Area', Communication: 'Communication', Eccentricity: 'Eccentricity', Handling: 'Handling', Kicking: 'Kicking', OneOnOnes: 'One on Ones', Punching: 'Punching', Reflexes: 'Reflexes', RushingOut: 'Rushing Out', Throwing: 'Throwing',
  },
  // FR/DE volgen de gangbare FM-termen; correcties van native spelers zijn welkom via een issue/PR.
  fr: {
    Corners: 'Corners', Crossing: 'Centres', Dribbling: 'Dribble', Finishing: 'Finition', FirstTouch: 'Contrôle', FreeKicks: 'Coups francs', Heading: 'Jeu de tête', LongShots: 'Tirs de loin', LongThrows: 'Touches longues', Marking: 'Marquage', Passing: 'Passes', PenaltyTaking: 'Penaltys', Tackling: 'Tacles', Technique: 'Technique',
    Aggression: 'Agressivité', Anticipation: 'Anticipation', Bravery: 'Courage', Composure: 'Sang-froid', Concentration: 'Concentration', Decisions: 'Décisions', Determination: 'Détermination', Flair: 'Flair', Leadership: 'Leadership', OffTheBall: 'Déplacements', Positioning: 'Placement', Teamwork: 'Collectif', Vision: 'Vision du jeu', WorkRate: 'Volume de jeu',
    Acceleration: 'Accélération', Agility: 'Agilité', Balance: 'Équilibre', JumpingReach: 'Détente', NaturalFitness: 'Condition naturelle', Pace: 'Vitesse', Stamina: 'Endurance', Strength: 'Force',
    AerialReach: 'Jeu aérien', CommandOfArea: 'Autorité dans la surface', Communication: 'Communication', Eccentricity: 'Excentricité', Handling: 'Prise de balle', Kicking: 'Dégagements', OneOnOnes: 'Un contre un', Punching: 'Sorties aux poings', Reflexes: 'Réflexes', RushingOut: 'Sorties', Throwing: 'Relances à la main',
  },
  de: {
    Corners: 'Ecken', Crossing: 'Flanken', Dribbling: 'Dribbling', Finishing: 'Abschluss', FirstTouch: 'Ballannahme', FreeKicks: 'Freistöße', Heading: 'Kopfball', LongShots: 'Weitschüsse', LongThrows: 'Weite Einwürfe', Marking: 'Manndeckung', Passing: 'Passspiel', PenaltyTaking: 'Elfmeter', Tackling: 'Tackling', Technique: 'Technik',
    Aggression: 'Aggressivität', Anticipation: 'Antizipation', Bravery: 'Mut', Composure: 'Gelassenheit', Concentration: 'Konzentration', Decisions: 'Entscheidungen', Determination: 'Entschlossenheit', Flair: 'Flair', Leadership: 'Führungsqualität', OffTheBall: 'Freilaufen', Positioning: 'Stellungsspiel', Teamwork: 'Teamarbeit', Vision: 'Übersicht', WorkRate: 'Einsatzfreude',
    Acceleration: 'Antritt', Agility: 'Beweglichkeit', Balance: 'Balance', JumpingReach: 'Sprungkraft', NaturalFitness: 'Natürliche Fitness', Pace: 'Schnelligkeit', Stamina: 'Ausdauer', Strength: 'Kraft',
    AerialReach: 'Luftbeherrschung', CommandOfArea: 'Strafraumbeherrschung', Communication: 'Kommunikation', Eccentricity: 'Exzentrik', Handling: 'Fangsicherheit', Kicking: 'Abschlag', OneOnOnes: 'Eins gegen eins', Punching: 'Fausten', Reflexes: 'Reflexe', RushingOut: 'Herauslaufen', Throwing: 'Abwurf',
  },
};
const attrName = k => ((ATTR_LABEL[state.lang] || ATTR_LABEL.en)[k] ?? k);

// Localized labels for staff attributes exported by the plugin (plugin/Fields.cs StaffAttrs).
const STAFF_ATTR_LABEL = {
  nl: {
    Aanvallen: 'Aanvallen', Verdedigen: 'Verdedigen', Fitheid: 'Fitheid', Balbezit: 'Balbezit',
    Technisch: 'Technisch', Tactisch: 'Tactisch', Standaardsituaties: 'Standaardsituaties',
    Vastberadenheid: 'Vastberadenheid', LevelOfDiscipline: 'Discipline', 'Man-management': 'Man-management', Motiveren: 'Motiveren',
    Oordeel_vermogen: 'Oordeel vermogen', Oordeel_potentie: 'Oordeel potentie', Oordeel_staf: 'Oordeel staf',
    Onderhandelen: 'Onderhandelen', Tactische_kennis: 'Tactische kennis', Fysiotherapie: 'Fysiotherapie',
    Sportwetenschap: 'Sportwetenschap', Data_analyse: 'Data-analyse', Jeugd: 'Jeugd',
    KV_distributie: 'GK Distributie', KV_vangen: 'GK Balbeheersing', KV_reflexen: 'GK Reflexen',
  },
  en: {
    Aanvallen: 'Attacking', Verdedigen: 'Defending', Fitheid: 'Fitness', Balbezit: 'Possession',
    Technisch: 'Technical', Tactisch: 'Tactical', Standaardsituaties: 'Set Pieces',
    Vastberadenheid: 'Determination', LevelOfDiscipline: 'Level of Discipline', 'Man-management': 'Man Management', Motiveren: 'Motivating',
    Oordeel_vermogen: 'Judging Player Ability', Oordeel_potentie: 'Judging Player Potential', Oordeel_staf: 'Judging Staff Ability',
    Onderhandelen: 'Negotiating', Tactische_kennis: 'Tactical Knowledge', Fysiotherapie: 'Physiotherapy',
    Sportwetenschap: 'Sports Science', Data_analyse: 'Data Analysis', Jeugd: 'Working With Youngsters',
    KV_distributie: 'GK Distribution', KV_vangen: 'GK Handling', KV_reflexen: 'GK Shot Stopping',
  },
  fr: {
    Aanvallen: 'Attaque', Verdedigen: 'Défense', Fitheid: 'Physique', Balbezit: 'Possession',
    Technisch: 'Technique', Tactisch: 'Tactique', Standaardsituaties: 'Coups de pied arrêtés',
    Vastberadenheid: 'Détermination', LevelOfDiscipline: 'Discipline', 'Man-management': 'Gestion des hommes', Motiveren: 'Motivation',
    Oordeel_vermogen: 'Évaluation du niveau', Oordeel_potentie: 'Évaluation du potentiel', Oordeel_staf: 'Évaluation du staff',
    Onderhandelen: 'Négociation', Tactische_kennis: 'Connaissances tactiques', Fysiotherapie: 'Kinésithérapie',
    Sportwetenschap: 'Science du sport', Data_analyse: 'Analyse de données', Jeugd: 'Travail avec les jeunes',
    KV_distributie: 'GBD Distribution', KV_vangen: 'GBD Prise de balle', KV_reflexen: 'GBD Réflexes',
  },
  de: {
    Aanvallen: 'Angriffsspiel', Verdedigen: 'Abwehrspiel', Fitheid: 'Fitness', Balbezit: 'Ballbesitz',
    Technisch: 'Technik', Tactisch: 'Taktik', Standaardsituaties: 'Standardsituationen',
    Vastberadenheid: 'Entschlossenheit', LevelOfDiscipline: 'Disziplin', 'Man-management': 'Menschenführung', Motiveren: 'Motivation',
    Oordeel_vermogen: 'Spielerfähigkeit bewerten', Oordeel_potentie: 'Spielerpotenzial bewerten', Oordeel_staf: 'Mitarbeiterfähigkeit bewerten',
    Onderhandelen: 'Verhandeln', Tactische_kennis: 'Taktikkenntnisse', Fysiotherapie: 'Physiotherapy',
    Sportwetenschap: 'Sportwissenschaft', Data_analyse: 'Datenanalyse', Jeugd: 'Arbeit mit Jugendlichen',
    KV_distributie: 'TW-Passspiel', KV_vangen: 'TW-Fangsicherheit', KV_reflexen: 'TW-Schussabwehr',
  },
};
const staffAttrName = k => ((STAFF_ATTR_LABEL[state.lang] || STAFF_ATTR_LABEL.en)[k] ?? k.replace(/_/g, ' '));
const isStaffAttrKey = k => typeof k === 'string' && k in STAFF_ATTR_LABEL.en;
const STAFF_ATTR_GROUPS = [
  ['g_coaching', ['Aanvallen', 'Verdedigen', 'Fitheid', 'Balbezit', 'Technisch', 'Tactisch', 'Standaardsituaties']],
  ['g_mental', ['Vastberadenheid', 'LevelOfDiscipline', 'Man-management', 'Motiveren']],
  ['g_knowledge', ['Oordeel_vermogen', 'Oordeel_potentie', 'Oordeel_staf', 'Onderhandelen', 'Tactische_kennis', 'Fysiotherapie', 'Sportwetenschap', 'Data_analyse', 'Jeugd']],
  ['g_gkCoaching', ['KV_distributie', 'KV_vangen', 'KV_reflexen']],
];

// FM sorteert attributen binnen een groep alfabetisch in de taal van de game; wij dus ook,
// op de vertaalde naam. Gebruikt door profiel, vergelijking en het attribuutfilter.
const sortByLabel = keys => [...keys].sort((a, b) => attrName(a).localeCompare(attrName(b), state.lang));

// ---------- EU/EEA-landen ----------
// Landnamen komen uit de dump in de TAAL WAARIN FM DRAAIT. Daarom staat dezelfde lijst
// hier in de gangbare FM-talen; ontbreekt de taal, dan herkent de app geen enkel EU-land
// (filter leeg + elke minderjarige als niet-EU behandeld). Structurele fix — een
// taalonafhankelijk land-ID uit het geheugen — staat in de backlog.
const EU_NATIONS = new Set([
  // nl
  'Nederland', 'België', 'Duitsland', 'Frankrijk', 'Italië', 'Spanje', 'Portugal', 'Ierland',
  'Oostenrijk', 'Polen', 'Zweden', 'Denemarken', 'Finland', 'Tsjechië', 'Slowakije', 'Hongarije',
  'Roemenië', 'Bulgarije', 'Griekenland', 'Kroatië', 'Slovenië', 'Luxemburg', 'Estland', 'Letland',
  'Litouwen', 'Malta', 'Cyprus', 'Noorwegen', 'IJsland', 'Liechtenstein', 'Zwitserland',
  // en
  'Netherlands', 'Belgium', 'Germany', 'France', 'Italy', 'Spain', 'Ireland', 'Austria', 'Poland',
  'Sweden', 'Denmark', 'Czechia', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria',
  'Greece', 'Croatia', 'Slovenia', 'Luxembourg', 'Estonia', 'Latvia', 'Lithuania', 'Norway',
  'Iceland', 'Switzerland',
  // de
  'Niederlande', 'Belgien', 'Deutschland', 'Frankreich', 'Italien', 'Spanien', 'Irland',
  'Österreich', 'Schweden', 'Dänemark', 'Finnland', 'Tschechien', 'Slowakei', 'Ungarn',
  'Rumänien', 'Bulgarien', 'Griechenland', 'Kroatien', 'Slowenien', 'Luxemburg', 'Estland',
  'Lettland', 'Litauen', 'Zypern', 'Norwegen', 'Island', 'Schweiz',
  // fr
  'Pays-Bas', 'Belgique', 'Allemagne', 'Italie', 'Espagne', 'Irlande', 'Autriche', 'Pologne',
  'Suède', 'Danemark', 'Finlande', 'Tchéquie', 'République tchèque', 'Slovaquie', 'Hongrie',
  'Roumanie', 'Bulgarie', 'Grèce', 'Croatie', 'Slovénie', 'Estonie', 'Lettonie', 'Lituanie',
  'Malte', 'Chypre', 'Norvège', 'Islande', 'Suisse',
  // es
  'Países Bajos', 'Bélgica', 'Alemania', 'Francia', 'España', 'Irlanda', 'Polonia', 'Suecia',
  'Dinamarca', 'Finlandia', 'Chequia', 'República Checa', 'Eslovaquia', 'Hungría', 'Rumanía',
  'Rumania', 'Grecia', 'Croacia', 'Eslovenia', 'Luxemburgo', 'Letonia', 'Lituania', 'Chipre',
  'Noruega', 'Islandia', 'Suiza',
  // it
  'Paesi Bassi', 'Belgio', 'Germania', 'Spagna', 'Portogallo', 'Svezia', 'Danimarca',
  'Cechia', 'Repubblica Ceca', 'Slovacchia', 'Ungheria', 'Croazia', 'Lussemburgo', 'Lettonia',
  'Lituania', 'Cipro', 'Norvegia', 'Islanda', 'Svizzera',
  // pt
  'Países Baixos', 'Holanda', 'Alemanha', 'França', 'Itália', 'Espanha', 'Áustria', 'Polónia',
  'Polônia', 'Suécia', 'Chéquia', 'República Tcheca', 'Eslováquia', 'Hungria', 'Roménia',
  'Romênia', 'Bulgária', 'Grécia', 'Croácia', 'Eslovénia', 'Eslovênia', 'Estónia', 'Estônia',
  'Letónia', 'Letônia', 'Lituânia', 'Islândia', 'Suíça',
  // hu
  'Hollandia', 'Németország', 'Franciaország', 'Olaszország', 'Spanyolország', 'Portugália',
  'Írország', 'Ausztria', 'Lengyelország', 'Svédország', 'Dánia', 'Finnország', 'Csehország',
  'Szlovákia', 'Magyarország', 'Görögország', 'Horvátország', 'Szlovénia', 'Észtország',
  'Lettország', 'Litvánia', 'Málta', 'Ciprus', 'Norvégia', 'Izland', 'Svájc',
  // tr
  'Hollanda', 'Belçika', 'Almanya', 'Fransa', 'İtalya', 'İspanya', 'Portekiz', 'İrlanda',
  'Avusturya', 'Polonya', 'İsveç', 'Danimarka', 'Finlandiya', 'Çekya', 'Slovakya', 'Macaristan',
  'Romanya', 'Bulgaristan', 'Yunanistan', 'Hırvatistan', 'Slovenya', 'Lüksemburg', 'Estonya',
  'Letonya', 'Litvanya', 'Kıbrıs', 'Norveç', 'İzlanda', 'Lihtenştayn', 'İsviçre',
].map(s => s.toLowerCase()));
// EU/EER-check: via het nation-ID als dat er is (taalonafhankelijk), anders de naamlijst.
const isEu = p => { const r = natRec(p); return r ? r[4] === 1 : (p.nat || []).some(n => EU_NATIONS.has((n || '').toLowerCase())); };

// Voet: de plugin schrijft NL ('Rechts'/'Links'/'Beide') in de dump → vertalen bij tonen.
// ---------- ontwikkeling: groei t.o.v. een peildatum ----------
// Alles hieronder leest uit één bron: state.hist, opgehaald bij het laden van een dump.
// Daarop draaien de groeikolom, het groeifilter, "alleen nieuwe spelers" en de intakebalk.
//
// Peildatum uit de gekozen periode. De grens van "dit seizoen" is 1 juli, net als bij het
// seizoensrapport. Valt de peildatum vóór de eerste momentopname, dan wordt het stilzwijgend
// de vroegste datum die we hebben: liever "sinds we meten" dan een lege kolom.
const HIST_PERIODS = ['last', 'm6', 'y1', 'season', 'all'];
function histRefDate() {
  const gd = state.meta.gameDate;
  const dates = state.hist ? state.hist.dates : null;
  if (!gd || !dates || dates.length < 2) return null;
  const d = parseGameDate(gd);
  // Lokaal formatteren, consistent met parseGameDate: toISOString zou ten westen van UTC
  // een dag terugvallen.
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const r = (() => {
    switch (state.histPeriod) {
      case 'last': return dates[dates.length - 2];
      case 'm6': { const x = new Date(d); x.setMonth(x.getMonth() - 6); return iso(x); }
      case 'season': { const y = seasonYearOf(); return y ? `${y}-07-01` : dates[0]; }
      case 'all': return dates[0];
      default: { const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return iso(x); }
    }
  })();
  // De belofte uit de comment hierboven waarmaken: peildatum vóór de eerste momentopname
  // wordt de vroegste datum. Zonder clamp kreeg iedereen het stempel "nieuw" zodra de
  // historie korter was dan de gekozen periode. (ISO-strings vergelijken lexicografisch.)
  return r && r < dates[0] ? dates[0] : r;
}
// Basislijn onder CA 40 is geen echte speler maar een half ingevuld record (FM vult
// newgens en niet-gescoute spelers gaandeweg aan). Zonder deze ondergrens bestaat de
// stijgerslijst uit "CA 1 -> 98" zonder naam; mét ondergrens uit echte doorbraken.
const HIST_MIN_BASE = 40;
// De map is op numerieke uid gesleuteld (zie refreshHistDeltas): deze twee functies draaien
// per rij bij elk filter én bij het sorteren, dus een String()-conversie per aanroep zou
// tienduizenden overbodige allocaties per toetsaanslag kosten.
function caGrowth(p) {
  const h = state.hist && state.hist.map.get(p.id);
  if (!h || h[0] == null || h[0] < HIST_MIN_BASE) return null;
  return (p.ca || 0) - h[0];
}
// Nieuw sinds de peildatum: eerste waarneming ligt ná de peildatum.
function isNewSince(p) {
  const h = state.hist && state.hist.map.get(p.id);
  return !!h && h[2] > state.hist.refIdx;
}
// Zonder meetpunten in de map is er niets te tonen, ook al kennen we wel datums (bv. een
// save zonder in-game datum, waardoor er geen peildatum te bepalen valt).
const histReady = () => !!(state.hist && state.hist.dates.length >= 2 && state.hist.map.size);

async function setHistPeriod(per) {
  state.histPeriod = per;
  try { localStorage.setItem('fmss_histperiod', per); } catch { }
  $('f-hist-period').value = per;
  await refreshHistDeltas();
}
// De hele sectie verdwijnt zonder historie of met verborgen CA: een periodekeuze zonder
// data eronder is alleen maar verwarrend.
function renderDevSection() {
  const on = histReady() && !state.hideCapa && state.mode !== 'staff';
  const sec = $('fg-development');
  if (sec) sec.style.display = on ? '' : 'none';
  if (!on) return;
  $('f-hist-period').value = state.histPeriod;
}

async function loadHistDeltas() {
  state.hist = null;
  try {
    const mgr = encodeURIComponent(state.meta.manager || 'default');
    // Eerst alleen de datumlijst (kleine respons), want "sinds de vorige dump" heeft die
    // nodig om een peildatum te kunnen kiezen. Daarna pas de volle set ophalen.
    const probe = await fetch(`/api/history/deltas?manager=${mgr}`);
    if (!probe.ok) return;
    const meta = await probe.json();
    if (!meta.dates || meta.dates.length < 2) return;
    state.hist = { dates: meta.dates, refIdx: 0, map: new Map() };
    await refreshHistDeltas();
  } catch { /* historie is nice-to-have, nooit het laden blokkeren */ }
}
async function refreshHistDeltas() {
  if (!state.hist) return;
  const ref = histRefDate();
  if (!ref) return;
  try {
    const mgr = encodeURIComponent(state.meta.manager || 'default');
    const r = await fetch(`/api/history/deltas?manager=${mgr}&since=${ref}`);
    if (!r.ok) return;
    const j = await r.json();
    // refIdx = laatste momentopname op of vóór de peildatum; alles daarna telt als "nieuw".
    let ri = -1;
    j.dates.forEach((d, i) => { if (d <= ref) ri = i; });
    // Numerieke sleutels: uid's komen als string uit JSON, maar p.id is een getal.
    const map = new Map();
    for (const k in j.p) map.set(+k, j.p[k]);
    state.hist = { dates: j.dates, refIdx: ri, map };
    intakeCache = null;
  } catch { /* laat de vorige stand staan */ }
}

// ---------- intakebalk ----------
// Een jeugdintake is te herkennen aan de vorm van de instroom: veel spelers ineens, en
// bijna allemaal 17 of jonger. Gekalibreerd op 24 echte dumpovergangen: die drempels
// vinden alle zeven intakes (incl. de zuidelijke ronde in oktober) en wijzen elke
// transferwindow-piek af (bv. 510 nieuwe spelers waarvan 11% jong).
const INTAKE_MIN = 200, INTAKE_YOUNG_SHARE = 0.7, INTAKE_MAX_SHARE = 0.4;
// De uitkomst hangt alleen aan de dump en de historie, niet aan filters of taal. Zonder
// deze memo loopt renderIntakeBar bij elke tab- of taalwissel opnieuw door 51k spelers.
let intakeCache = null;
function intakeSince() {
  if (!histReady() || state.hideCapa) return null;
  if (intakeCache) return intakeCache.v;
  const lastIdx = state.hist.dates.length - 1;
  const done = v => { intakeCache = { v }; return v; };
  const fresh = state.players.filter(p => {
    const h = state.hist.map.get(p.id);
    return h && h[2] === lastIdx;
  });
  if (fresh.length < INTAKE_MIN) return done(null);
  // Nieuwe carrière of ineens veel meer competities geladen: dan is "nieuw" betekenisloos.
  if (fresh.length > state.players.length * INTAKE_MAX_SHARE) return done(null);
  const withAge = fresh.filter(p => getAge(p) > 0);
  const young = withAge.filter(p => getAge(p) <= 17).length;
  if (!withAge.length || young / withAge.length < INTAKE_YOUNG_SHARE) return done(null);
  let best = null;
  for (const p of fresh) if (p.pa > 0 && (!best || p.pa > best.pa)) best = p;   // geen sort van 1500 rijen
  return done({ n: fresh.length, best });
}
function renderIntakeBar() {
  const bar = $('intake-bar');
  if (!bar) return;
  const key = state.hist ? state.hist.dates[state.hist.dates.length - 1] : '';
  const info = state.mode === 'players' && localStorage.getItem('fmss_intake_seen') !== key ? intakeSince() : null;
  if (!info) { bar.classList.add('hidden'); return; }
  const best = info.best
    ? `<span class="ib-best">${tf('intakeBest', { p: `${escHtml(info.best.name)}, ${getAge(info.best)}, ${escHtml(info.best.club || '?')}` })} · PA ${info.best.pa}</span>` : '';
  bar.innerHTML = `${icon('ball', 14)}<span class="ib-txt">${escHtml(tf('intakeTitle', { n: info.n.toLocaleString(uiLocale()) }))}</span>${best}
    <button class="ib-go">${t('intakeShow')}</button>
    <button class="ib-x" title="${t('donateLater')}">${icon('x', 12)}</button>`;
  bar.classList.remove('hidden');
  const dismiss = () => { try { localStorage.setItem('fmss_intake_seen', key); } catch { } bar.classList.add('hidden'); };
  bar.querySelector('.ib-x').onclick = dismiss;
  bar.querySelector('.ib-go').onclick = async () => {
    dismiss();
    $('btn-clear').onclick();
    await setHistPeriod('last');
    $('f-new').checked = true;
    $('f-age-max').value = 18;
    state.sortKey = 'pa'; state.sortDir = -1;
    renderTable(); applyFilters();
  };
}

// Wonderkid: jong, veel groei over én een top uitzicht. Eén definitie voor het filter en
// het gouden randje op de spelerskaart, zodat die twee niet uit elkaar kunnen lopen.
// Leeftijd 0/onbekend telt niet mee.
//
// De PA-drempel is er bewust bij (26-07): zonder die eis haalt bijna elke zestienjarige de
// 25 punten groei, en dan is 28% van de database "wonderkid" (14.201 van 51.345 spelers in
// een echte save). Met PA >= 150 blijven er 556 over: een lijst waar je echt op kunt scouten,
// en goud op de kaart betekent weer iets.
const WONDERKID_PA = 150;
function isWonderkid(p) {
  const a = getAge(p);
  return a > 0 && a <= 21 && (p.pa || 0) >= WONDERKID_PA && (p.pa || 0) - (p.ca || 0) >= 25;
}
const FOOT_KEY = { rechts: 'footR', links: 'footL', beide: 'footB', right: 'footR', left: 'footL', both: 'footB' };
const footLabel = p => { const k = FOOT_KEY[(p.foot || '').toLowerCase()]; return k ? t(k) : (p.foot || '–'); };

// Landnamen komen in de gametaal uit het geheugen (NL bij een Nederlandse FM).
// Bij app-taal EN vertalen we de bekende NL-namen; onbekend blijft zoals de game het gaf.
// Alleen namen die NL/EN verschillen; identieke (Portugal, Ghana...) hoeven niet.
const NATION_EN = {
  'Nederland': 'Netherlands', 'België': 'Belgium', 'Duitsland': 'Germany', 'Frankrijk': 'France',
  'Spanje': 'Spain', 'Italië': 'Italy', 'Engeland': 'England', 'Schotland': 'Scotland',
  'Wales': 'Wales', 'Noord-Ierland': 'Northern Ireland', 'Ierland': 'Ireland',
  'Oostenrijk': 'Austria', 'Zwitserland': 'Switzerland', 'Polen': 'Poland', 'Zweden': 'Sweden',
  'Noorwegen': 'Norway', 'Denemarken': 'Denmark', 'Finland': 'Finland', 'IJsland': 'Iceland',
  'Tsjechië': 'Czechia', 'Slowakije': 'Slovakia', 'Hongarije': 'Hungary', 'Roemenië': 'Romania',
  'Bulgarije': 'Bulgaria', 'Griekenland': 'Greece', 'Kroatië': 'Croatia', 'Servië': 'Serbia',
  'Bosnië en Herzegovina': 'Bosnia and Herzegovina', 'Slovenië': 'Slovenia',
  'Noord-Macedonië': 'North Macedonia', 'Albanië': 'Albania', 'Montenegro': 'Montenegro',
  'Kosovo': 'Kosovo', 'Turkije': 'Turkey', 'Rusland': 'Russia', 'Oekraïne': 'Ukraine',
  'Wit-Rusland': 'Belarus', 'Litouwen': 'Lithuania', 'Letland': 'Latvia', 'Estland': 'Estonia',
  'Georgië': 'Georgia', 'Armenië': 'Armenia', 'Azerbeidzjan': 'Azerbaijan', 'Moldavië': 'Moldova',
  'Luxemburg': 'Luxembourg', 'Cyprus': 'Cyprus', 'Israël': 'Israel',
  'Brazilië': 'Brazil', 'Argentinië': 'Argentina', 'Uruguay': 'Uruguay', 'Chili': 'Chile',
  'Colombia': 'Colombia', 'Peru': 'Peru', 'Ecuador': 'Ecuador', 'Paraguay': 'Paraguay',
  'Bolivia': 'Bolivia', 'Venezuela': 'Venezuela',
  'Verenigde Staten': 'United States', 'Mexico': 'Mexico', 'Canada': 'Canada',
  'Costa Rica': 'Costa Rica', 'Jamaica': 'Jamaica', 'Honduras': 'Honduras', 'Panama': 'Panama',
  'Marokko': 'Morocco', 'Algerije': 'Algeria', 'Tunesië': 'Tunisia', 'Egypte': 'Egypt',
  'Senegal': 'Senegal', 'Ivoorkust': 'Ivory Coast', 'Nigeria': 'Nigeria', 'Kameroen': 'Cameroon',
  'Zuid-Afrika': 'South Africa', 'Kaapverdië': 'Cape Verde', 'Guinee': 'Guinea',
  'Congo-Kinshasa': 'DR Congo', 'Democratische Republiek Congo': 'DR Congo',
  'Japan': 'Japan', 'Zuid-Korea': 'South Korea', 'China': 'China', 'Australië': 'Australia',
  'Nieuw-Zeeland': 'New Zealand', 'Saoedi-Arabië': 'Saudi Arabia', 'Iran': 'Iran', 'Irak': 'Iraq',
  'Verenigde Arabische Emiraten': 'United Arab Emirates', 'Qatar': 'Qatar', 'Indonesië': 'Indonesia',
};
// Landnamen: bij voorkeur via het taalonafhankelijke nation-ID uit de dump (natId,
// plugin 0.1.44+) en de NATIONS-tabel uit nations.js: dan klopt de weergave in elke
// game- én app-taal (issue #15). Oude dumps zonder natId vallen terug op de naamstring,
// met de NL→EN-tabel voor niet-NL app-talen.
const NAT_LANG_IDX = { nl: 0, en: 1, fr: 2, de: 3 };
const natRec = p => (typeof NATIONS !== 'undefined' && p && p.natId && NATIONS[p.natId]) || null;
const natLabel = n => state.lang !== 'nl' ? (NATION_EN[n] || n) : n;
const natsLabel = p => { const r = natRec(p); return r ? r[NAT_LANG_IDX[state.lang] ?? 1] : (p.nat || []).map(natLabel).join(', '); };

// Kolommen die onder de "verborgen stats"-toggle vallen: CA/PA zelf, plus meta-score en
// vraagprijs (beide afgeleid van/verweven met verborgen data, Marks keuze).
// Groei is uit CA afgeleid, dus die valt onder dezelfde verberg-toggle. Zonder historie
// bestaat de kolom niet: hem tonen met overal "–" zou alleen maar vragen oproepen.
// PA-meta valt onder béíde toggles: hij is uit meta-gewichten én PA afgeleid.
const hiddenStatCol = k => (state.hideCapa && (k === 'ca' || k === 'pa' || k === 'fee' || k === 'growth' || k === 'metapa'))
  || (state.hideMeta && (k === 'meta' || k === 'metapa')) || (k === 'growth' && !histReady());

// ---------- geld ----------
// Salarisweergave: de dump bewaart loon per week; alleen de wéérgave rekent om.
// Filters en interne modellen (interesse, loonplafond) blijven op weekbasis werken.
const WAGE_FACTOR = { w: 1, m: 52 / 12, y: 52 };
const wageFactor = () => WAGE_FACTOR[state.wagePer] || 1;
const fmtWage = v => v == null ? '–' : fmtMoney(v * wageFactor());
const wageSuf = () => t(state.wagePer === 'm' ? 'perMonthSuf' : state.wagePer === 'y' ? 'perYearSuf' : 'perWeekSuf');
function fmtMoney(v) {
  if (v == null) return '–';
  const sym = CUR_RATE[state.cur] ? state.cur : '£';   // onbekende localStorage-waarde → £
  const val = v * CUR_RATE[sym];
  if (val === 0) return sym + '0';
  const abs = Math.abs(val);
  if (abs >= 1e9) return sym + (val / 1e9).toFixed(2) + t('billion');
  if (abs >= 1e6) return sym + (val / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sym + Math.round(val / 1e3) + 'K';
  return sym + Math.round(val);
}
// Dump levert ISO (yyyy-mm-dd); tonen als dd-mm-yyyy. CSV-export houdt bewust ISO
// (sorteert/parset beter in spreadsheets).
const fmtDate = v => {
  const s = v ? String(v) : '';
  return s.length >= 10 ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : (s || '–');
};

// ---------- leeftijd o.b.v. peiljaar ----------
function getAge(p) {
  if (p.birthYear) {
    let a = state.refYear - p.birthYear;
    if (p.birthDoy && p.birthDoy > state.refDoy) a -= 1;
    return a;
  }
  return p.age;
}
// In-game datums ('yyyy-mm-dd') als LOKALE middernacht parsen. new Date('yyyy-mm-dd') is
// UTC-middernacht; wie daarna lokale velden leest (getMonth/getDate) zit ten westen van
// UTC een dag te vroeg: leeftijden en de seizoensgrens verschoven voor Amerikaanse gebruikers.
const parseGameDate = s => new Date(String(s) + 'T00:00:00');
function gameNow() {
  const g = state.meta.gameDate ? parseGameDate(state.meta.gameDate) : new Date();
  return new Date(state.refYear, g.getMonth(), g.getDate());
}

// ---------- kolommen ----------
const qClass = v => v == null ? '' : v >= 150 ? 'q5' : v >= 120 ? 'q4' : v >= 90 ? 'q3' : v >= 60 ? 'q2' : 'q1';
const qHtml = v => v == null ? '<span class="dim">·</span>' : `<span class="${qClass(v)}">${v}</span>`;
// contract-cel: amber als het contract bijna afloopt, als scouting-signaal
function expiresHtml(p) {
  const m = monthsUntil(p.expires);
  if (m == null) return { cls: 'dim', txt: '–' };
  const txt = fmtDate(p.expires);
  if (m <= 6) return { cls: 'exp-soon', txt };
  if (m <= 12) return { cls: 'exp-year', txt };
  return { cls: '', txt };
}

// w = standaard kolombreedte (px) voor de vaste tabel-lay-out; door de gebruiker
// gesleepte breedtes (colWidths) gaan vóór. Vast i.p.v. op inhoud, anders verspringen
// de kolommen bij elke sortering/scroll (de zichtbare rijen bepalen dan de breedte).
const PLAYER_COLS = [
  { key: 'sl', label: '★', star: true, w: 34 },
  { key: 'name', label: 'c_name', get: p => p.name, name: true, w: 180 },
  { key: 'age', label: 'c_age', num: true, get: p => getAge(p), w: 50 },
  { key: 'pos', label: 'c_pos', get: p => posRank(p), render: p => p.pos ? escHtml(p.pos) : '<span class="dim">–</span>', w: 95 },
  { key: 'club', label: 'c_club', get: p => p.club || '', render: p => clubLabel(p), w: 175 },
  { key: 'div', label: 'c_div', get: p => playerDivisionLabel(p), render: p => p.div ? escHtml(playerDivisionLabel(p)) : '<span class="dim">–</span>', defHidden: true, w: 190 },
  { key: 'nat', label: 'c_nat', get: p => natsLabel(p), w: 115 },
  { key: 'eu', label: 'EU', get: p => isEu(p) ? 1 : 0, render: p => isEu(p) ? `<span class="eu-yes">${icon('check', 12)}</span>` : '<span class="dim">–</span>', w: 42 },
  { key: 'ca', label: 'CA', num: true, get: p => p.ca, render: p => qHtml(p.ca), w: 56 },
  { key: 'pa', label: 'PA', num: true, get: p => p.pa, render: p => qHtml(p.pa), w: 56 },
  // Groei: null bij spelers zonder basislijn (nieuw of te dun record). Bewust géén 0, want
  // de sortering zet null onderaan; met 0 zouden newgens bovenin een stijgerslijst staan.
  { key: 'growth', label: 'c_growth', num: true, help: 'growthHint', get: caGrowth, render: p => growthHtml(p), w: 74 },
  { key: 'meta', label: 'c_meta', num: true, help: 'metaHint', get: p => metaScore(p), render: p => metaHtml(p), w: 64 },
  { key: 'metapa', label: 'c_metapa', num: true, help: 'metaPaHint', get: p => metaPaScore(p), render: p => metaPaHtml(p), w: 68 },
  { key: 'value', label: 'c_value', num: true, get: p => estValue(p).v, render: p => estHtml(p), w: 95 },
  { key: 'fee', label: 'c_fee', num: true, get: p => { const f = feeEstimate(p); return f.v == null ? -1 : f.v; }, render: p => feeHtml(p), w: 105 },
  { key: 'wage', label: 'c_wage', num: true, get: p => p.wage, fmt: fmtWage, w: 100 },
  { key: 'expires', label: 'c_expires', get: p => p.expires, fmt: fmtDate, tdCls: p => expiresHtml(p).cls, w: 110 },
  { key: 'interest', label: 'c_interest', help: 'interestHint', get: p => { const i = interestEstimate(p); return i ? i.score : -1; }, render: p => intHtml(p), w: 110 },
  { key: 'status', label: 'c_status', get: p => 0, render: p => statusHtml(p), w: 110 },
  // Standaard verboren extra kolommen (via rechtsklik aan te zetten, sorteerbaar):
  { key: 'clubRep', label: 'c_clubrep', num: true, get: p => p.clubRep || 0, defHidden: true, w: 85 },
  { key: 'worldRep', label: 'c_worldrep', num: true, get: p => p.worldRep || 0, defHidden: true, w: 85 },
  { key: 'height', label: 'height', num: true, get: p => p.height, fmt: v => v ? v + ' cm' : '–', defHidden: true, w: 70 },
  { key: 'foot', label: 'foot', get: p => footLabel(p), defHidden: true, w: 75 },
];
// FM24's community-reported coach formula uses 1–20 attributes and DDM
// (Determination + Level of Discipline + Motivating). Scores are out of 300;
// each 30-point band adds half a star, with 5 stars starting at 271. Workload
// adjustments are not included.
const STAFF_TRAINING_ATTRS = {
  attacking: ['Attacking', 'Aanvallen'],
  defending: ['Defending', 'Verdedigen'],
  fitness: ['Fitness', 'Fitheid'],
  possession: ['Mental', 'BallControl', 'Possession', 'Balbezit'],
  technical: ['Technical', 'Technisch'],
  tactical: ['Tactical', 'Tactisch'],
  setPieces: ['SetPieces', 'Set Pieces', 'Standaardsituaties'],
  tacticalKnowledge: ['TacticalKnowledge', 'Tactical Knowledge', 'Tactische_kennis'],
  determination: ['Determination', 'Vastberadenheid'],
  discipline: ['LevelOfDiscipline', 'Level of Discipline', 'Discipline'],
  motivating: ['Motivating', 'Motiveren'],
  gkDistribution: ['GKDistribution', 'KV_distributie'],
  gkHandling: ['GKHandling', 'KV_vangen'],
  gkShotStopping: ['GKShotStopping', 'KV_reflexen'],
};
const STAFF_TRAINING_CATEGORIES = [
  { key: 'coachAttTac', main: 'attacking', secondary: 'tactical' },
  { key: 'coachAttTech', main: 'attacking', secondary: 'technical' },
  { key: 'coachDefTac', main: 'defending', secondary: 'tactical' },
  { key: 'coachDefTech', main: 'defending', secondary: 'technical' },
  { key: 'coachPossTac', main: 'possession', secondary: 'tactical' },
  { key: 'coachPossTech', main: 'possession', secondary: 'technical' },
  { key: 'coachFitStrength', main: 'fitness', single: true },
  { key: 'coachFitQuickness', main: 'fitness', single: true },
  { key: 'coachGkStop', main: 'gkShotStopping', single: true },
  { key: 'coachGkHandleDist', main: 'gkHandling', secondary: 'gkDistribution' },
  { key: 'coachSetPieces', main: 'setPieces', secondary: 'tacticalKnowledge' },
];
function staffTrainingAttr(p, key) {
  const attrs = p && p.staffAttrs;
  if (!attrs) return null;
  for (const name of STAFF_TRAINING_ATTRS[key] || []) {
    const value = attrs[name];
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
function staffTrainingStars(p, category) {
  if (!p || !p.staffAttrs) return null;
  const cache = p._staffTrainingStars ||= {};
  if (cache[category.key] !== undefined) return cache[category.key];
  const main = staffTrainingAttr(p, category.main);
  const secondary = category.secondary ? staffTrainingAttr(p, category.secondary) : null;
  const determination = staffTrainingAttr(p, 'determination');
  const discipline = staffTrainingAttr(p, 'discipline');
  const motivating = staffTrainingAttr(p, 'motivating');
  if ([main, determination, discipline, motivating].some(value => !Number.isFinite(value)) ||
      (category.secondary && !Number.isFinite(secondary)))
    return cache[category.key] = null;
  const ddm = determination + discipline + motivating;
  const score = category.single ? 9 * main + 2 * ddm : 6 * main + 3 * secondary + 2 * ddm;
  return cache[category.key] = Math.min(5, Math.max(0.5, Math.ceil(score / 30) / 2));
}
const staffTrainingStarsHtml = value => value == null ? '<span class="dim">–</span>'
  : `<span class="training-stars">${Number.isInteger(value) ? value : value.toFixed(1)}</span>`;

const STAFF_COLS = [
  { key: 'name', label: 'c_name', get: p => p.name, name: true, w: 180 },
  { key: 'age', label: 'c_age', num: true, get: p => getAge(p), w: 50 },
  { key: 'job', label: 'c_role', get: p => jobLabel(p), w: 150 },
  { key: 'club', label: 'c_club', get: p => p.club || '', render: p => clubLabel(p), w: 175 },
  { key: 'nat', label: 'c_nat', get: p => natsLabel(p), w: 115 },
  { key: 'ca', label: 'CA', num: true, get: p => p.ca, render: p => qHtml(p.ca), w: 56 },
  { key: 'pa', label: 'PA', num: true, get: p => p.pa, render: p => qHtml(p.pa), w: 56 },
  { key: 'wage', label: 'c_wage', num: true, get: p => p.wage, fmt: fmtWage, w: 100 },
  { key: 'expires', label: 'c_expires', get: p => p.expires, fmt: fmtDate, tdCls: p => expiresHtml(p).cls, w: 110 },
  { key: 'clubRep', label: 'c_clubrep', num: true, get: p => p.clubRep || 0, defHidden: true, w: 85 },
  { key: 'worldRep', label: 'c_worldrep', num: true, get: p => p.worldRep || 0, defHidden: true, w: 85 },
  ...STAFF_TRAINING_CATEGORIES.map((category, index) => ({
    key: category.key, label: category.key, num: true, get: p => staffTrainingStars(p, category),
    render: p => staffTrainingStarsHtml(staffTrainingStars(p, category)),
    help: index === 0 ? 'staffTrainingStarsHint' : null, w: 88,
  })),
];

// ---------- geschatte marktwaarde (GBP) ----------
// Gekalibreerd op ~45 spelers met een échte FM-waarde (dump + in-game screenshots, laag/mid/top).
// Belangrijkste bevinding uit die data: FM-waarde volgt vooral de WERELDREPUTATIE (faam), niet CA.
// Twee spelers met dezelfde reputatie zijn ~even veel waard, ongeacht CA; CA en reputatie zijn
// bovendien zo gecorreleerd dat CA meenemen het model onstabiel maakt. Daarom: reputatie (met
// verzadiging aan de top) + leeftijd + resterende contractduur, plus een lichte jeugd-correctie.
// Gevolg/beperking: een sterke speler met lage faam (kleine club) wordt eerder onderschat.
// De écht accurate route is de waarde rechtstreeks uit het geheugen lezen (zoals GenieScout);
// zie docs/backlog.md.
const VAL_B = { c0: 10.96, wRep: 0.997, age: -0.069, yhead: -0.041, lnC: 0.507 };
function wSat(w) { return Math.min(w, 7500) + 0.30 * Math.max(0, w - 7500); }   // faam vlakt af aan de top
// Écht clubloos = geen club én geen clubreputatie. (Club met wél rep maar zonder naam is een
// niet-opgeloste clubverwijzing, geen transfervrije speler — zie clubLabel.)
const isFree = p => !p.club && !(p.clubRep > 0);
// Clublabel: naam, of "onbekende club" als de plugin wél een clubreputatie vond maar de naam
// niet kon uitlezen (bekende beperking), of "clubloos" bij een echte transfervrije speler.
function clubLabel(p) {
  if (p.club) return escHtml(p.club);
  if (p.clubRep > 0) return `<span class="dim" data-tip="${escHtml(tf('clubNotRead', { r: p.clubRep }))}">${t('clubUnknown')}</span>`;
  // Transfervrij: streepje met tooltip (de status-pill "clubloos" vertelt het al).
  return `<span class="dim" data-help="clubless">–</span>`;
}
// Gememoiseerd per speler (_ev); zie metaScore. Consumers lezen het object alleen.
function estValue(p) {
  if (p._ev !== undefined) return p._ev;
  return p._ev = estValueCalc(p);
}
function estValueCalc(p) {
  if (p.value != null && p.value > 0) return { v: p.value, est: false, lo: Math.round(p.value * 0.85), hi: Math.round(p.value * 1.15) };
  if (!p.ca || p.ca < 1) return { v: null, est: false };
  if (isFree(p)) return { v: 0, est: true };
  const a = getAge(p) || 25;
  const m = monthsUntil(p.expires);
  const head = Math.max(0, (p.pa || p.ca) - p.ca);
  const yhead = a <= 21 ? head : a <= 24 ? head * 0.5 : 0;
  let ln = VAL_B.c0
    + VAL_B.wRep * (wSat(p.worldRep || 3000) / 1000)
    + VAL_B.age * a
    + VAL_B.yhead * yhead
    + VAL_B.lnC * Math.log(Math.max(2, m == null ? 36 : m));
  let v = Math.exp(ln);
  if (m != null && m <= 4) v *= 0.7;                     // (bijna) transfervrij
  v = v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 1e4) * 1e4;
  const band = a <= 20 ? 0.5 : 0.35;
  return { v, est: true, lo: Math.round(v * (1 - band)), hi: Math.round(v * (1 + band)) };
}
function estHtml(p) {
  const e = estValue(p);
  if (e.v == null) return '<span class="dim">–</span>';
  // Transfervrij: gewoon een streepje (de status-kolom/pill vertelt het verhaal al).
  if (e.v === 0) return `<span class="dim" data-help="free_l">–</span>`;
  return (e.est ? '<span class="dim">~</span>' : '') + fmtMoney(e.v);
}

// ---------- geschatte vraagprijs / transfersom ----------
// Doel: wat betaal IK (mijn club) waarschijnlijk voor deze speler. Verkoopbereidheid domineert:
// een gelist(t)e of vrijgegeven speler gaat rond of onder de waarde weg, ongeacht contractduur —
// de contractpremie geldt alleen voor spelers die de club wil houden. Daarbovenop: een
// koper-afhankelijke opslag (verkopers vragen meer aan een grotere club, FM's "big club tax")
// en een squad-status-proxy via de loonrang binnen de verkopende club.
// Niet te vangen uit de data: exacte squad-status, concurrerende clubs, jouw budget — dus schatting.

// Loonrang binnen de verkopende club als proxy voor squad-status: de topverdiener is
// waarschijnlijk een sterspeler (club vraagt meer), een laagbetaalde randspeler is
// makkelijker op te halen. Cache per dump (state._clubWages).
function wageRankInClub(p) {
  if (!p.club || !(p.wage > 0)) return null;
  if (!state._clubWages) {
    const map = new Map();
    for (const q of state.players) {
      if (!q.club || !(q.wage > 0)) continue;
      const k = q.club.toLowerCase();
      let arr = map.get(k);
      if (!arr) map.set(k, arr = []);
      arr.push(q.wage);
    }
    for (const arr of map.values()) arr.sort((a, b) => b - a);
    state._clubWages = map;
  }
  const arr = state._clubWages.get(p.club.toLowerCase());
  if (!arr || arr.length < 8) return null;   // te weinig spelers van deze club in de dump
  return { rank: arr.findIndex(w => w <= p.wage) + 1, n: arr.length };
}

function feeMultiplier(p) {
  const m = monthsUntil(p.expires);
  const mm = m == null ? 30 : m;

  // Club wil van de speler af → vraagprijs rond of onder de waarde, contractpremie vervalt.
  if (p.setForRelease) return 0.2;                                     // vrijwel weggeefprijs
  // A listed player's guide value is not an authoritative asking price; keep the
  // multiplier neutral and present the resulting fee as an estimate.
  if (p.listed) return 1.0;

  // IJking 14-07 (55 spelers, Telstar t/m Mbappé, tools/value-calib.js): FM's getoonde
  // transferwaarde-bandbreedte omsluit ons waardeveld vrijwel altijd binnen ~±15%, en
  // kopen blijkt rond die band te kunnen. v1 stapelde premies tot ×2,4 — veel te hoog.
  // De signalen blijven, maar gematigd; échte "betaald vs. waarde"-datapoints van mavarobli
  // kunnen dit verder aanscherpen.
  let f = Math.min(1.35, Math.max(0.6, 0.7 + 0.014 * mm));
  if (p.notForSale) f *= 1.5;                               // niet te koop: alleen los te weken met een fors bod

  const a = getAge(p) || 25;
  const head = Math.max(0, (p.pa || p.ca) - p.ca);
  if (a <= 21 && head >= 15) f *= 1 + Math.min(0.2, head * 0.007);    // wonderkind-premie (gematigd)
  else if (a <= 23) f *= 1.05;
  else if (a >= 31) f *= 0.8;
  else if (a >= 29) f *= 0.9;

  const r = wageRankInClub(p);
  if (r) {
    if (r.rank <= 2) f *= 1.12;                             // topverdiener: waarschijnlijk sterspeler
    else if (r.rank <= 5) f *= 1.05;
    else if (r.rank / r.n > 0.6) f *= 0.92;                 // randspeler: makkelijker op te halen
  }

  // Koper-afhankelijk: verkopers vragen meer aan een grotere/rijkere club ("big club tax")
  // en nemen genoegen met minder van een kleinere club.
  const myRep = state.meta.myClubRep || 0;
  if (myRep && p.clubRep > 0) {
    const gap = myRep - p.clubRep;
    f *= Math.min(1.2, Math.max(0.88, 1 + gap / 15000));
  }

  return Math.min(p.notForSale ? 2.2 : 1.7, Math.max(0.4, f));
}
// Gememoiseerd per speler (_fee); zie metaScore.
function feeEstimate(p) {
  if (p._fee !== undefined) return p._fee;
  return p._fee = feeEstimateCalc(p);
}
function feeEstimateCalc(p) {
  if (Number(p.askingPrice) > 0) return { v: Number(p.askingPrice), valueEst: false, exact: true };
  const ev = estValue(p);
  if (ev.v == null) return { v: null };
  if (ev.v === 0) return { v: 0 };
  let v = ev.v * feeMultiplier(p);
  v = v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 1e4) * 1e4;
  return { v, valueEst: ev.est, exact: false };
}
function feeHtml(p) {
  const f = feeEstimate(p);
  if (f.v == null) return '<span class="dim">–</span>';
  if (f.v === 0) return `<span class="dim" data-help="free_l">–</span>`;
  const exact = f.exact === true;
  return (exact ? '' : '<span class="dim">~</span>') + fmtMoney(f.v);
}

// ---------- interesse-inschatting (heuristiek) ----------
// Loonplafond van mijn club: geschat uit de hoogste salarissen in mijn eigen selectie.
// Een doelwit dat véél meer verdient dan mijn topverdieners is lastig te verleiden.
function myWageCeiling() {
  if (state._wageCeil !== undefined) return state._wageCeil;
  const club = (state.meta.myClub || '').toLowerCase();
  const wages = state.players.filter(p => (p.club || '').toLowerCase() === club && p.wage > 0)
    .map(p => p.wage).sort((a, b) => b - a);
  // referentie = op één na hoogste loon (voorkomt dat één uitschieter het plafond bepaalt)
  const ref = wages.length >= 2 ? wages[1] : wages[0];
  state._wageCeil = ref ? Math.round(ref * 1.3) : null;   // ~30% rek boven de huidige top
  return state._wageCeil;
}
// Logistische kans (0-100) dat een speler een overstap naar mijn club ziet zitten.
// Gememoiseerd per speler (_int); het label bevat vertaalde tekst, dus de cache is
// gestempeld met de taal en wordt bij een taalwissel per speler opnieuw berekend.
function interestEstimate(p) {
  if (p._int !== undefined && p._intL === state.lang) return p._int;
  p._intL = state.lang;
  return p._int = interestEstimateCalc(p);
}
function interestEstimateCalc(p) {
  const myRep = state.meta.myClubRep || 0;
  if (!myRep) return null;
  if (p.club && (p.club || '').toLowerCase() === (state.meta.myClub || '').toLowerCase()) return null; // eigen speler

  // Reputatie: mijn club vs (a) huidige club en (b) de persoonlijke status van de speler.
  // Bij jonge spelers weegt de clubkloof zwaarder: hun lage wereldreputatie is vooral leeftijd,
  // geen "klein spelertje", dus statuskloof zou de interesse anders kunstmatig opblazen.
  const age = getAge(p);
  const known = age != null && age > 0;   // geboortejaar kan ontbreken → leeftijd onbekend, niet "0 jaar"
  const eu = isEu(p);
  const clubGap = myRep - (p.clubRep || 0);
  const statGap = myRep - (p.worldRep || 0);
  const blend = known && age <= 19 ? (0.9 * clubGap + 0.15 * statGap) : (0.55 * clubGap + 0.45 * statGap);
  let score = 100 / (1 + Math.exp(-blend / 1400));   // 0 kloof → 50; +1400 → ~73; -1400 → ~27

  // Beschikbaarheidssignalen
  if (isFree(p)) score = Math.max(score, 72);                     // clubloos: alleen loon nodig
  if (p.listed || p.setForRelease) score += 15;                  // club wil verkopen
  if (p.notForSale) score *= 0.4;                                // niet te koop: fors omlaag
  const m = monthsUntil(p.expires);
  if (m != null && m <= 6) score += 14;                          // (bijna) transfervrij
  else if (m != null && m <= 12) score += 7;

  // Loon-haalbaarheid: past de speler in mijn loonstructuur?
  const ceil = myWageCeiling();
  if (ceil && p.wage > 0 && !isFree(p)) {
    const ratio = p.wage / ceil;
    if (ratio > 1) score -= Math.min(38, (ratio - 1) * 46);      // boven budget: moeilijk
    else score += Math.min(6, (1 - ratio) * 8);                  // ruim betaalbaar: klein duwtje
  }

  // Persoonlijkheid (nu uit de dump): ambitie stuwt naar een stap omhoog en remt een stap
  // omlaag/lateraal; loyaliteit houdt spelers bij hun club.
  if (p.ambition) score += (blend >= 0 ? 1.2 : -2.2) * (p.ambition - 10);
  if (p.loyalty && !isFree(p)) score *= (1 - 0.45 * (p.loyalty / 20));

  // Leeftijd: jonge spelers verhuizen minder makkelijk (settelen, ontwikkelen bij eigen club).
  if (known && age <= 16) score *= 0.7;
  else if (known && age <= 17) score *= 0.85;

  // FIFA Art. 19: non-EU-speler onder de 18 kan internationaal pas komen vanaf z'n 18e.
  // Bij onbekende leeftijd géén minderjarigen-cap: dan zou een speler zonder geboortejaar
  // onterecht als "te jong" worden weggezet.
  let note = null;
  if (known && age <= 15) { score = Math.min(score, 6); note = 'minor'; }
  else if (known && age <= 17 && !eu) { score = Math.min(score, 8); note = 'minorIntl'; }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? t('int_big') : score >= 45 ? t('int_ok') : score >= 25 ? t('int_small') : t('int_no');
  const cls = score >= 70 ? 'int-g' : score >= 45 ? 'int-r' : score >= 25 ? 'int-k' : 'int-n';
  return { score, label, cls, note };
}
function intHtml(p) {
  const i = interestEstimate(p);
  if (!i) return '<span class="dim">?</span>';
  return `<span class="int ${i.cls}" data-tip="${i.score}/100">${i.label}</span>`;
}

function statusHtml(p) {
  let h = '';
  if (isFree(p)) h += `<span class="tag free">${t('tag_free')}</span>`;
  if (p.listed) h += `<span class="tag listed">${t('tag_listed')}</span>`;
  if (p.loanListed) h += `<span class="tag listed">${t('tag_loan')}</span>`;
  if (p.setForRelease) h += `<span class="tag rel">${t('tag_rel')}</span>`;
  if (p.notForSale) h += `<span class="tag nfs">${t('tag_nfs')}</span>`;
  return h || '<span class="dim">–</span>';
}
// Positievolgorde zoals in FM: van doel naar aanval (GK ... ST), niet alfabetisch.
const POS_ORDER = ['GK', 'DL', 'DC', 'DR', 'WBL', 'WBR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST'];
const POS_RANK = Object.fromEntries(POS_ORDER.map((p, i) => [p, i]));
function posRank(p) {
  const prof = p.posProficiency;
  let positions;
  if (prof && Object.keys(prof).length > 0) {
    positions = Object.entries(prof)
      .filter(([, v]) => v >= state.profThreshold)
      .map(([pos]) => pos);
    // Niets boven de drempel: val terug op de hoogst-getrainde positie
    if (!positions.length) {
      const best = Object.entries(prof).sort((a, b) => b[1] - a[1])[0];
      positions = best ? [best[0]] : [];
    }
  } else {
    positions = p.posArr || [];   // oude dump zonder proficiency-data
  }
  if (!positions.length) return 99;
  return Math.min(...positions.map(x => POS_RANK[x] ?? 98));   // meest verdedigende gekwalificeerde positie
}
function isAttainable(p) {
  if (p.notForSale) return false;
  const m = monthsUntil(p.expires);
  return p.listed || p.setForRelease || isFree(p) || (m != null && m <= 12);
}

// ---------- geavanceerd attribuutfilter ----------
// Regels [{k, min, max}] over zichtbare attributen, verborgen kenmerken en persoonlijkheid,
// EN-gecombineerd. Persoonlijkheid leeft op het speler-object zelf, de rest in p.attrs.
// Regels op verborgen data doen niet mee zolang "verborgen stats" uit staat.
const ADV_HIDDEN_KEYS = ['Consistency', 'ImportantMatches', 'Versatility', 'InjuryProneness', 'Dirtiness'];
const ADV_PERS_KEYS = ['ambition', 'professionalism', 'loyalty', 'pressure', 'temperament', 'sportsmanship', 'adaptability', 'controversy'];
const advIsHidden = k => ADV_HIDDEN_KEYS.includes(k) || ADV_PERS_KEYS.includes(k);
const advLabel = k => isStaffAttrKey(k) ? staffAttrName(k) : ADV_PERS_KEYS.includes(k) ? t(k) : ADV_HIDDEN_KEYS.includes(k) ? t('a_' + k) : attrName(k);
const advValue = (p, k) => p.staffAttrs ? (p.staffAttrs[k] ?? null) : ADV_PERS_KEYS.includes(k) ? (p[k] || null) : (p.attrs ? p.attrs[k] : null);
const getCurAdvRules = () => state.mode === 'staff' ? (state.advStaffF ||= []) : state.advF;
const activeAdvRules = () => getCurAdvRules().filter(r => r.k && (r.min || r.max) && !(state.hideCapa && advIsHidden(r.k)));
const advChipTxt = r => `${advLabel(r.k)} ${r.min && r.max ? r.min + '–' + r.max : r.min ? '≥ ' + r.min : '≤ ' + r.max}`;
function saveAdv() {
  localStorage.setItem('fmss_adv', JSON.stringify(state.advF));
  localStorage.setItem('fmss_adv_staff', JSON.stringify(state.advStaffF || []));
  persistFilterTab();
  updateAdvBtn();
}
// Alleen een teller op de knop; de regels zelf staan al in de chips boven de tabel
// en in de popup, een derde lijst in de zijbalk was dubbelop.
function updateAdvBtn() {
  const n = activeAdvRules().length;
  const b = $('btn-adv');
  b.textContent = t('advBtn') + (n ? ` (${n})` : '') + '…';
  b.classList.toggle('has-rules', n > 0);
}
function advDialog() {
  const m = $('adv-modal');
  const isStaff = state.mode === 'staff';
  const getRules = () => isStaff ? (state.advStaffF ||= []) : state.advF;
  let curRules = getRules();

  // Doorzoekbare attributencatalogus: speler-, staf-, verborgen en persoonlijkheidsattributen.
  const catalog = [];
  if (isStaff) {
    for (const [g, keys] of STAFF_ATTR_GROUPS) {
      const sortedKeys = [...keys].sort((a, b) => staffAttrName(a).localeCompare(staffAttrName(b), state.lang));
      for (const k of sortedKeys) catalog.push({ k, label: staffAttrName(k), group: t(g) });
    }
  } else {
    const gkOnly = ATTR_GROUPS_GK[0][1].filter(k => !ATTR_GROUPS_OUTFIELD.some(([, ks]) => ks.includes(k)));
    for (const [g, keys] of [...ATTR_GROUPS_OUTFIELD, ['g_goalkeeping', gkOnly]])
      for (const k of sortByLabel(keys)) catalog.push({ k, label: attrName(k), group: t(g) });
    if (!state.hideCapa) {
      const byT = (a, b) => a.localeCompare(b, state.lang);
      for (const k of [...ADV_HIDDEN_KEYS].sort((a, b) => byT(t('a_' + a), t('a_' + b)))) catalog.push({ k, label: t('a_' + k), group: t('hiddenTitle') });
      for (const k of [...ADV_PERS_KEYS].sort((a, b) => byT(t(a), t(b)))) catalog.push({ k, label: t(k), group: t('personaTitle') });
    }
  }
  // Escape sluit eerst een open attributen-dropdown, daarna pas de popup zelf.
  const esc = e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const dd = m.querySelector('.adv-dd:not(.hidden)');
    if (dd) dd.classList.add('hidden'); else close();
  };
  const close = () => {
    if (isStaff) state.advStaffF = state.advStaffF.filter(r => r.k);
    else state.advF = state.advF.filter(r => r.k);
    saveAdv();
    m.classList.add('hidden');
    document.removeEventListener('keydown', esc, true);
  };
  const render = () => {
    curRules = getRules();
    m.innerHTML = `<div class="pm-card adv-card">
      <div class="pm-title">${t('advTitle')}</div>
      <div class="adv-head"><span class="ah-attr">${t('advColAttr')}</span><span class="ah-mm">${t('advMin')}</span><span class="ah-mm">${t('advMax')}</span><span class="ah-sp"></span></div>
      <div id="adv-rows">` + curRules.map((r, i) => `
        <div class="adv-row" data-i="${i}">
          <div class="adv-kwrap">
            <input type="text" class="adv-kin" value="${r.k ? escHtml(advLabel(r.k)) : ''}" placeholder="${t('advSearch')}" autocomplete="off">
            <div class="adv-dd hidden"></div>
          </div>
          <input type="number" class="adv-min" min="1" max="20" placeholder="${t('advMin')}" value="${r.min || ''}">
          <input type="number" class="adv-max" min="1" max="20" placeholder="${t('advMax')}" value="${r.max || ''}">
          <button class="adv-x" title="${t('clear')}">${icon('x', 12)}</button>
        </div>`).join('') + `</div>
      <button class="adv-add">${t('advAdd')}</button>
      <div class="pm-actions">
        <button class="pm-cancel">${t('advClear')}</button>
        <button class="pm-ok">${t('advDone')}</button>
      </div>
    </div>`;
    m.querySelectorAll('.adv-row').forEach(row => {
      const r = curRules[+row.dataset.i];
      const kin = row.querySelector('.adv-kin'), dd = row.querySelector('.adv-dd');
      // Combobox: klikken opent de volledige (gegroepeerde) lijst, typen filtert hem.
      const buildDd = termRaw => {
        const term = (termRaw || '').trim().toLowerCase();
        const used = new Set(curRules.filter(x => x !== r && x.k).map(x => x.k));
        const hits = catalog.filter(c => !used.has(c.k) && (!term || c.label.toLowerCase().includes(term)));
        if (term) hits.sort((a, b) => a.label.toLowerCase().indexOf(term) - b.label.toLowerCase().indexOf(term));
        let html = '', lastG = null;
        for (const c of hits) {
          if (!term && c.group !== lastG) { html += `<div class="asg-h">${c.group}</div>`; lastG = c.group; }
          html += `<div class="adv-sug-i" data-k="${c.k}"><span>${c.label}</span><span class="asg">${c.group}</span></div>`;
        }
        dd.innerHTML = html || `<div class="asg-h">–</div>`;
        // mousedown (niet click): vóór de blur van het invoerveld
        dd.querySelectorAll('.adv-sug-i').forEach(el => el.onmousedown = e => { e.preventDefault(); pick(el.dataset.k); });
      };
      const pick = k => {
        const fresh = !r.k;
        r.k = k; saveAdv(); applyFilters();
        kin.value = advLabel(k);
        dd.classList.add('hidden');
        if (fresh || (!r.min && !r.max)) row.querySelector('.adv-min').focus();
      };
      kin.onfocus = () => { buildDd(''); dd.classList.remove('hidden'); kin.select(); };
      kin.oninput = () => { buildDd(kin.value); dd.classList.remove('hidden'); };
      kin.onblur = () => setTimeout(() => { dd.classList.add('hidden'); kin.value = r.k ? advLabel(r.k) : ''; }, 120);
      kin.onkeydown = e => {
        if (e.key === 'Enter') { const f = dd.querySelector('.adv-sug-i'); if (f) pick(f.dataset.k); }
      };
      row.querySelector('.adv-min').oninput = e => { r.min = +e.target.value || 0; saveAdv(); applyFilters(); };
      row.querySelector('.adv-max').oninput = e => { r.max = +e.target.value || 0; saveAdv(); applyFilters(); };
      row.querySelector('.adv-x').onclick = () => { curRules.splice(+row.dataset.i, 1); saveAdv(); applyFilters(); render(); };
    });
    m.querySelector('.adv-add').onclick = () => {
      curRules.push({ k: '', min: 0, max: 0 });
      render();
      const kins = m.querySelectorAll('.adv-kin');
      const last = kins[kins.length - 1];
      last.focus(); last.onfocus();   // dropdown meteen open, ook als het focus-event niet vuurt
    };
    m.querySelector('.pm-cancel').onclick = () => { curRules.length = 0; saveAdv(); applyFilters(); render(); };
    m.querySelector('.pm-ok').onclick = close;
  };
  document.addEventListener('keydown', esc, true);
  m.onclick = e => { if (e.target === m) close(); };
  if (!curRules.length) curRules.push({ k: '', min: 0, max: 0 });
  render();
  m.classList.remove('hidden');   // eerst zichtbaar, anders pakt focus() niet
  const firstEmpty = [...m.querySelectorAll('.adv-row')].find(row => !curRules[+row.dataset.i].k);
  if (firstEmpty) { const k = firstEmpty.querySelector('.adv-kin'); k.focus(); k.onfocus(); }
}

// ---------- tactische rollen (rolgeschiktheid) ----------
// Per rol: welke posities passen, plus KEY-attributen (zwaar) en PREF-attributen (licht),
// naar het model van FM's groen/blauw gemarkeerde eigenschappen. Score = gewogen gemiddelde
// op de 1-20 schaal (key telt 2x, pref 1x), zodat het naast de losse attributen leesbaar blijft.
const ROLES = [
  // Keepers
  { id: 'gk', pos: ['GK'], key: ['Handling', 'Reflexes', 'OneOnOnes', 'Positioning', 'Concentration', 'Agility'], pref: ['AerialReach', 'CommandOfArea', 'Communication', 'Kicking', 'Anticipation', 'Decisions', 'Bravery'] },
  { id: 'sk', pos: ['GK'], key: ['Reflexes', 'OneOnOnes', 'RushingOut', 'Handling', 'Positioning', 'Agility', 'Composure', 'Decisions'], pref: ['CommandOfArea', 'Communication', 'Kicking', 'FirstTouch', 'Passing', 'Anticipation', 'Concentration'] },
  // Centrale verdedigers
  { id: 'cd', pos: ['DC'], key: ['Marking', 'Tackling', 'Positioning', 'Heading', 'JumpingReach', 'Strength', 'Concentration', 'Decisions'], pref: ['Anticipation', 'Bravery', 'Composure', 'Aggression', 'Pace', 'Acceleration'] },
  { id: 'bpd', pos: ['DC'], key: ['Marking', 'Tackling', 'Positioning', 'Passing', 'Composure', 'Vision', 'Decisions', 'JumpingReach'], pref: ['Heading', 'Strength', 'FirstTouch', 'Technique', 'Anticipation', 'Concentration', 'Pace'] },
  // Backs
  { id: 'fb', pos: ['DL', 'DR'], key: ['Marking', 'Tackling', 'Positioning', 'Anticipation', 'Concentration', 'Stamina', 'Pace', 'WorkRate'], pref: ['Crossing', 'Dribbling', 'Passing', 'Decisions', 'Teamwork', 'Acceleration', 'Agility'] },
  { id: 'wb', pos: ['DL', 'DR', 'WBL', 'WBR'], key: ['Crossing', 'Dribbling', 'Tackling', 'OffTheBall', 'Stamina', 'Pace', 'Acceleration', 'WorkRate', 'Teamwork'], pref: ['Marking', 'FirstTouch', 'Passing', 'Technique', 'Anticipation', 'Positioning', 'Agility', 'Balance'] },
  // Verdedigende middenvelders
  { id: 'dm', pos: ['DM'], key: ['Tackling', 'Marking', 'Positioning', 'Anticipation', 'Concentration', 'Teamwork', 'WorkRate', 'Decisions', 'Stamina'], pref: ['Aggression', 'Passing', 'Composure', 'Strength', 'Bravery', 'FirstTouch'] },
  { id: 'dlp', pos: ['DM', 'MC'], key: ['Passing', 'Vision', 'FirstTouch', 'Technique', 'Composure', 'Decisions', 'Teamwork', 'OffTheBall'], pref: ['Anticipation', 'Positioning', 'Tackling', 'Balance', 'WorkRate', 'Flair'] },
  { id: 'bwm', pos: ['DM', 'MC'], key: ['Tackling', 'Aggression', 'WorkRate', 'Stamina', 'Teamwork', 'Anticipation', 'Marking', 'Bravery'], pref: ['Positioning', 'Determination', 'Concentration', 'Strength', 'Acceleration', 'Pace'] },
  // Centrale middenvelders
  { id: 'cm', pos: ['MC'], key: ['Passing', 'Tackling', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'FirstTouch', 'Composure'], pref: ['Technique', 'Vision', 'OffTheBall', 'Anticipation', 'Positioning'] },
  { id: 'b2b', pos: ['MC'], key: ['Stamina', 'WorkRate', 'Tackling', 'Passing', 'OffTheBall', 'Teamwork', 'Decisions', 'FirstTouch'], pref: ['Finishing', 'LongShots', 'Technique', 'Composure', 'Anticipation', 'Strength', 'Acceleration', 'Determination'] },
  { id: 'ap', pos: ['MC', 'AMC'], key: ['Passing', 'Vision', 'Technique', 'FirstTouch', 'Composure', 'Decisions', 'OffTheBall', 'Flair'], pref: ['Dribbling', 'Anticipation', 'Agility', 'Teamwork', 'Acceleration'] },
  // Aanvallende / brede middenvelders
  { id: 'wing', pos: ['ML', 'MR', 'AML', 'AMR'], key: ['Crossing', 'Dribbling', 'Technique', 'Pace', 'Acceleration', 'Agility', 'OffTheBall'], pref: ['FirstTouch', 'Passing', 'Flair', 'Balance', 'Stamina', 'Anticipation'] },
  { id: 'if', pos: ['AML', 'AMR'], key: ['Dribbling', 'Finishing', 'FirstTouch', 'Technique', 'OffTheBall', 'Pace', 'Acceleration', 'Agility', 'Composure'], pref: ['LongShots', 'Passing', 'Flair', 'Anticipation', 'Balance', 'Vision'] },
  { id: 'am', pos: ['AMC'], key: ['OffTheBall', 'FirstTouch', 'Technique', 'Finishing', 'Composure', 'Decisions', 'Dribbling', 'Passing'], pref: ['LongShots', 'Vision', 'Flair', 'Anticipation', 'Acceleration', 'Agility'] },
  // Spitsen
  { id: 'af', pos: ['ST'], key: ['Finishing', 'OffTheBall', 'Composure', 'FirstTouch', 'Dribbling', 'Technique', 'Acceleration', 'Pace'], pref: ['Anticipation', 'Decisions', 'Agility', 'Balance', 'Flair'] },
  { id: 'poacher', pos: ['ST'], key: ['Finishing', 'OffTheBall', 'Anticipation', 'Composure', 'FirstTouch'], pref: ['Dribbling', 'Heading', 'Technique', 'Decisions', 'Acceleration', 'Pace'] },
  { id: 'tm', pos: ['ST'], key: ['Heading', 'JumpingReach', 'Strength', 'Bravery', 'FirstTouch', 'OffTheBall', 'Finishing', 'Balance'], pref: ['Aggression', 'Anticipation', 'Composure', 'Teamwork', 'Determination'] },
  { id: 'cf', pos: ['ST'], key: ['Finishing', 'FirstTouch', 'Technique', 'OffTheBall', 'Composure', 'Dribbling', 'Heading', 'Strength', 'Acceleration', 'Pace'], pref: ['Passing', 'Vision', 'LongShots', 'Anticipation', 'Decisions', 'Agility', 'Balance', 'JumpingReach'] },
];
const ROLE_LABEL = {
  nl: { gk: 'Keeper', sk: 'Meevoetballende keeper', cd: 'Centrale verdediger', bpd: 'Opbouwende verdediger', fb: 'Vleugelverdediger', wb: 'Wingback', dm: 'Verdedigende middenvelder', dlp: 'Verdiepte spelmaker', bwm: 'Baljagende middenvelder', cm: 'Centrale middenvelder', b2b: 'Box-to-box middenvelder', ap: 'Aanvallende spelmaker', wing: 'Buitenspeler', if: 'Schaduwspits', am: 'Hangende spits', af: 'Diepliggende spits', poacher: 'Afmaker', tm: 'Targetman', cf: 'Complete spits' },
  en: { gk: 'Goalkeeper', sk: 'Sweeper Keeper', cd: 'Central Defender', bpd: 'Ball Playing Defender', fb: 'Full Back', wb: 'Wing Back', dm: 'Defensive Midfielder', dlp: 'Deep Lying Playmaker', bwm: 'Ball Winning Midfielder', cm: 'Central Midfielder', b2b: 'Box to Box Midfielder', ap: 'Advanced Playmaker', wing: 'Winger', if: 'Inside Forward', am: 'Attacking Midfielder', af: 'Advanced Forward', poacher: 'Poacher', tm: 'Target Man', cf: 'Complete Forward' },
  fr: { gk: 'Gardien', sk: 'Gardien libéro', cd: 'Défenseur central', bpd: 'Défenseur relanceur', fb: 'Arrière latéral', wb: 'Piston', dm: 'Milieu défensif', dlp: 'Meneur reculé', bwm: 'Récupérateur', cm: 'Milieu central', b2b: 'Milieu box-to-box', ap: 'Meneur avancé', wing: 'Ailier', if: 'Attaquant intérieur', am: 'Milieu offensif', af: 'Attaquant avancé', poacher: 'Renard des surfaces', tm: 'Pivot', cf: 'Attaquant complet' },
  de: { gk: 'Torwart', sk: 'Mitspielender Torwart', cd: 'Innenverteidiger', bpd: 'Ballspielender Innenverteidiger', fb: 'Außenverteidiger', wb: 'Flügelverteidiger', dm: 'Defensiver Mittelfeldspieler', dlp: 'Tiefer Spielmacher', bwm: 'Balleroberer', cm: 'Zentraler Mittelfeldspieler', b2b: 'Box-to-Box-Spieler', ap: 'Offensiver Spielmacher', wing: 'Flügelspieler', if: 'Inverser Flügelstürmer', am: 'Offensiver Mittelfeldspieler', af: 'Vorgezogene Spitze', poacher: 'Knipser', tm: 'Zielspieler', cf: 'Komplette Spitze' },
};
const roleName = id => (ROLE_LABEL[state.lang]?.[id] ?? ROLE_LABEL.en[id] ?? id);

// Staffuncties: de dump draagt sinds plugin 0.1.45 het functie-byte (jobId) naast de
// NL-naamstring. Met het id vertalen we per app-taal; oude dumps of onbekende id's
// vallen terug op de dumpstring, en het generieke "Staflid" krijgt zijn eigen sleutel.
const JOB_LABEL = {
  nl: { 1: 'Speler', 2: 'Coach', 3: 'Speler/Coach', 4: 'Voorzitter', 6: 'Directeur', 8: 'Algemeen directeur', 10: 'Technisch directeur', 12: 'Fysiotherapeut', 14: 'Scout', 16: 'Manager', 17: 'Speler/Manager', 20: 'Assistent-manager', 21: 'Speler/Assistent-manager', 22: 'Media-analist', 24: 'Algemeen manager', 26: 'Fitnesscoach', 27: 'Speler/Fitnesscoach', 34: 'Keeperstrainer', 35: 'Speler/Keeperstrainer', 36: 'Hoofd data-analyse', 38: 'Clubarts', 40: 'Hoofd sportwetenschap', 42: 'Data-analist', 44: 'Hoofdscout', 45: 'Speler/Hoofdscout', 46: 'Arts', 48: 'Sportwetenschapper', 49: 'Speler/Jeugdtrainer', 50: 'Hoofd fysiotherapie', 52: 'U19-manager', 54: 'Trainer eerste elftal', 64: 'Hoofd jeugdopleiding', 65: 'Speler/Hoofd jeugd', 66: 'Eigenaar', 70: 'President', 86: 'Loanmanager', 88: 'Technisch directeur', 144: 'Interim-manager' },
  en: { 1: 'Player', 2: 'Coach', 3: 'Player/Coach', 4: 'Chairman', 6: 'Director', 8: 'Managing director', 10: 'Director of football', 12: 'Physio', 14: 'Scout', 16: 'Manager', 17: 'Player/Manager', 20: 'Assistant manager', 21: 'Player/Assistant manager', 22: 'Set Piece Coach', 24: 'General manager', 26: 'Fitness coach', 27: 'Player/Fitness coach', 34: 'Goalkeeping coach', 35: 'Player/GK coach', 36: 'Head of data analysis', 38: 'Club doctor', 40: 'Head of sports science', 42: 'Data analyst', 44: 'Chief scout', 45: 'Player/Chief scout', 46: 'Doctor', 48: 'Sports scientist', 49: 'Player/Youth coach', 50: 'Head physio', 52: 'U19 manager', 54: 'First-team coach', 64: 'Head of youth development', 65: 'Player/Head of youth', 66: 'Owner', 70: 'President', 86: 'Loan manager', 88: 'Technical director', 144: 'Caretaker manager' },
  fr: { 1: 'Joueur', 2: 'Entraîneur', 3: 'Joueur/Entraîneur', 4: 'Président du conseil', 6: 'Directeur', 8: 'Directeur général', 10: 'Directeur sportif', 12: 'Kinésithérapeute', 14: 'Recruteur', 16: 'Manager', 17: 'Joueur/Manager', 20: 'Adjoint', 21: 'Joueur/Adjoint', 22: 'Analyste média', 24: 'Manager général', 26: 'Préparateur physique', 27: 'Joueur/Préparateur physique', 34: 'Entraîneur des gardiens', 35: 'Joueur/Entraîneur des gardiens', 36: 'Resp. analyse de données', 38: 'Médecin du club', 40: 'Resp. sciences du sport', 42: 'Analyste de données', 44: 'Recruteur en chef', 45: 'Joueur/Recruteur en chef', 46: 'Médecin', 48: 'Scientifique du sport', 49: 'Joueur/Entraîneur de jeunes', 50: 'Kiné en chef', 52: 'Manager U19', 54: 'Entraîneur équipe première', 64: 'Resp. formation', 65: 'Joueur/Resp. formation', 66: 'Propriétaire', 70: 'Président', 86: 'Resp. des prêts', 88: 'Directeur technique', 144: 'Entraîneur intérimaire' },
  de: { 1: 'Spieler', 2: 'Trainer', 3: 'Spielertrainer', 4: 'Vorsitzender', 6: 'Direktor', 8: 'Geschäftsführer', 10: 'Sportdirektor', 12: 'Physiotherapeut', 14: 'Scout', 16: 'Manager', 17: 'Spielermanager', 20: 'Co-Trainer', 21: 'Spieler/Co-Trainer', 22: 'Medienanalyst', 24: 'General Manager', 26: 'Fitnesstrainer', 27: 'Spieler/Fitnesstrainer', 34: 'Torwarttrainer', 35: 'Spieler/Torwarttrainer', 36: 'Leiter Datenanalyse', 38: 'Vereinsarzt', 40: 'Leiter Sportwissenschaft', 42: 'Datenanalyst', 44: 'Chefscout', 45: 'Spieler/Chefscout', 46: 'Arzt', 48: 'Sportwissenschaftler', 49: 'Spieler/Jugendtrainer', 50: 'Leitender Physiotherapeut', 52: 'U19-Trainer', 54: 'Trainer 1. Mannschaft', 64: 'Leiter Nachwuchs', 65: 'Spieler/Nachwuchsleiter', 66: 'Eigentümer', 70: 'Präsident', 86: 'Leihspielermanager', 88: 'Technischer Direktor', 144: 'Interimstrainer' },
};
Object.assign(JOB_LABEL.nl, { 22: 'Set-piececoach' });
Object.assign(JOB_LABEL.fr, { 22: 'Entraîneur des coups de pied arrêtés' });
Object.assign(JOB_LABEL.de, { 22: 'Standardsituations-Trainer' });
const NON_RECRUITABLE_JOB_IDS = new Set([4, 6, 8, 66, 70]);
const NON_RECRUITABLE_JOB_NAMES = new Set(['chairman', 'director', 'managing director', 'owner', 'president']);
const staffRoleKey = p => {
  const id = Number(p?.jobId);
  return Number.isInteger(id) && JOB_LABEL.en[id] ? JOB_LABEL.en[id] : (p?.job || '');
};
function isRecruitableStaff(p) {
  const id = Number(p?.jobId);
  if (Number.isInteger(id) && NON_RECRUITABLE_JOB_IDS.has(id)) return false;
  return !NON_RECRUITABLE_JOB_NAMES.has(String(p?.job || '').trim().toLowerCase());
}
const jobLabel = p => {
  const L = JOB_LABEL[state.lang] || JOB_LABEL.en;
  if (p && p.jobId && L[p.jobId]) return L[p.jobId];
  if (p && p.job === 'Staflid') return t('jobStaff');
  return (p && p.job) || (p && p.staffAttrs ? t('jobStaff') : '–');
};
const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));
// Rolscore op de 1-20 schaal; key-attributen tellen dubbel. Vereist attributen (spelers).
function roleScore(p, role) {
  if (!p.attrs) return null;
  let sum = 0, w = 0;
  for (const k of role.key) { const v = p.attrs[k]; if (v != null) { sum += v * 2; w += 2; } }
  for (const k of role.pref) { const v = p.attrs[k]; if (v != null) { sum += v; w += 1; } }
  return w ? sum / w : null;
}
function rolesForPos(posArr) {
  const set = new Set(posArr || []);
  if (!set.size) return ROLES;                      // onbekende positie: toon alle
  const isGk = set.has('GK');
  return ROLES.filter(r => r.pos.some(x => set.has(x)) && (r.pos.includes('GK') === isGk));
}
// Beste rollen voor een speler (gesorteerd), voor het profiel.
function bestRoles(p, n = 5) {
  return rolesForPos(p.posArr).map(r => ({ id: r.id, score: roleScore(p, r) }))
    .filter(x => x.score != null).sort((a, b) => b.score - a.score).slice(0, n);
}
const roleClass = v => v == null ? '' : v >= 15 ? 'g5' : v >= 13 ? 'g4' : v >= 10.5 ? 'g3' : v >= 8 ? 'g2' : 'g1';

// Points-contribution meta display helpers.
// fmtMeta: formats a raw points score with sign and 2 decimals (e.g. "+7.71", "-0.50").
const fmtMeta = v => v == null ? '–' : (v >= 0 ? '+' : '') + v.toFixed(2);
// metaClass: colour band for a points score. Uses precomputed thresholds[group].
function metaClass(v, group) {
  if (v == null) return '';
  const t = META_PRESET && META_PRESET.thresholds && META_PRESET.thresholds[group];
  if (!t) return 'g2';
  return v >= t[3] ? 'g5' : v >= t[2] ? 'g4' : v >= t[1] ? 'g3' : v >= t[0] ? 'g2' : 'g1';
}

// ---------- meta-score (direct / points-contribution engine) ----------
// Source: attribute testing on a 38-match season (weight = points improvement attr 8→20).
// score = Σ (attr − 8) × coeff[attr]  +  (prof − 20) × coeff_prof
// Baseline 8, proficiency baseline 20 (Natural = no effect).
// All outfield positions share one unified weight table; GK uses a separate set.

// Shared outfield weights (DC/FB/DM/MC/WM/AM/ST all identical in the default direct preset).
const _OUTFIELD_W = {
  Pace: 64, Acceleration: 64, Stamina: 19, JumpingReach: 16, Balance: 13,
  Strength: 10, Agility: 8, NaturalFitness: 2,
  Anticipation: 18, WorkRate: 12, Concentration: 9, Determination: 6,
  Decisions: 1, Composure: 1, Dribbling: 19, Finishing: 8, LongShots: 6,
  Heading: 5, Crossing: 4, FirstTouch: 3, Passing: 2, Technique: 1,
  Tackling: 1, Consistency: 10, Corners: 0.5, FreeKicks: 0.5,
};

// Built-in preset (mirrors app/meta-presets/default_direct.json).
// Used as the synchronous fallback before the async fetch completes.
const BUILTIN_PRESET = {
  name: 'FMSuperScout Direct',
  baseline: 8,
  proficiency_baseline: 20,
  group_scale: { GK: 1, DC: 10, FB: 10, DM: 10, MC: 10, WM: 10, AM: 10, ST: 10 },
  proficiency_test: { points: 6, range: 5 },
  attr_test_ranges: { JumpingReach: 9 },
  position_weights: {
    GK: {
      Reflexes: 8, Agility: 6, Acceleration: 2,
      OneOnOnes: 0.3, AerialReach: 0.1, CommandOfArea: 0.1,
      Communication: 0.1, Handling: 0.1, Anticipation: 0.1,
      Concentration: 0.1, Positioning: 0.1,
    },
    DC: _OUTFIELD_W, FB: _OUTFIELD_W, DM: _OUTFIELD_W,
    MC: _OUTFIELD_W, WM: _OUTFIELD_W, AM: _OUTFIELD_W, ST: _OUTFIELD_W,
  },
  player_fields: {},
};

// ---------- per-position routing ----------
// Each FM position code maps to one of these named groups.
const POS_TO_META_GROUP = {
  GK:  'GK',
  DC:  'DC',  DL: 'FB',  DR: 'FB',  WBL: 'FB',  WBR: 'FB',
  DM:  'DM',
  MC:  'MC',  ML: 'WM',  MR: 'WM',
  AML: 'AM',  AMR: 'AM', AMC: 'AM',
  ST:  'ST',
};

// Label shown next to each group's score in the player card
const META_GROUP_LABEL = {
  GK: 'GK', DC: 'DC', FB: 'FB', DM: 'DM', MC: 'MC', WM: 'WM', AM: 'AM', ST: 'ST',
};

// ── Runtime meta preset ──────────────────────────────────────────────────────
// Loaded from meta-presets/default_direct.json at startup; can be swapped
// at runtime via the settings menu without touching source code.
// Falls back to BUILTIN_PRESET if the fetch fails.
let META_PRESET = null;   // set by applyMetaPreset() before first render

// Install a parsed preset object as the active META_PRESET.
// Clears per-player _meta/_metaPa/_metaGroup caches so next render recomputes scores.
//
// Only the direct (points-contribution) engine is supported:
//   score = Σ (attr − baseline) × coeff[attr] + (prof − profBaseline) × coeff_prof
//   Coefficients are precomputed here from the test-data weights stored in the JSON.
function applyMetaPreset(data) {
  if (data.baseline == null) {
    console.error('applyMetaPreset: preset missing "baseline" — only the direct engine is supported.');
    return;
  }

  const W = data.position_weights || {};

  const baseline      = data.baseline;                // attribute baseline (e.g. 8)
  const profBaseline  = data.proficiency_baseline ?? 20;
  const groupScale    = data.group_scale    || {};
  const profTest      = data.proficiency_test || { points: 6, range: 5 };
  // Support from/to fields in addition to explicit range (editor saves all three)
  if (profTest.from != null && profTest.to != null) profTest.range = Math.max(1, Math.abs(profTest.to - profTest.from));
  const attrTestRanges = data.attr_test_ranges || {};
  const defaultRange  = 20 - baseline;       // 12 for baseline=8

  const coeffs     = {};
  const coeff_prof = {};
  const thresholds = {};

  for (const [g, Wg] of Object.entries(W)) {
    const scale = groupScale[g] ?? 10;
    const gCoeffs = {};
    for (const [attr, weight] of Object.entries(Wg)) {
      if (Array.isArray(weight)) {
        // Piecewise segments: [{from, to, pts}, ...]
        gCoeffs[attr] = weight.map(seg => {
          const from = seg.from ?? 1, to = seg.to ?? 20;
          return { from, to, coeff: (to - from) > 0 ? (seg.pts ?? 0) / (scale * (to - from)) : 0 };
        });
      } else {
        const range = attrTestRanges[attr] ?? defaultRange;
        gCoeffs[attr] = weight / (scale * range);
      }
    }
    coeffs[g] = gCoeffs;
    if (profTest.segments && profTest.segments.length) {
      // Piecewise proficiency — store sorted descending [{from, to, coeff}]
      coeff_prof[g] = [...profTest.segments]
        .sort((a, b) => b.from - a.from)
        .map(seg => {
          const from = seg.from ?? 1, to = seg.to ?? 20;
          return { from, to, coeff: (to - from) > 0 ? (seg.pts ?? 0) / (scale * (to - from)) : 0 };
        });
    } else {
      coeff_prof[g] = profTest.points / (scale * profTest.range);
    }
    // Thresholds: score of a fake player with all attrs = V (piecewise-aware).
    const clampContrib = (V, c) => Array.isArray(c)
      ? c.reduce((s, {from, to, coeff}) =>
          s + (Math.max(from, Math.min(to, V)) - Math.max(from, Math.min(to, baseline))) * coeff, 0)
      : (V - baseline) * c;
    const sumForV = V => Object.values(gCoeffs).reduce((s, c) => s + clampContrib(V, c), 0);
    thresholds[g] = [0, sumForV(11), sumForV(14), sumForV(17)];
  }

  META_PRESET = {
    name:        data.name || 'Custom',
    weights:     W,
    baseline,
    profBaseline,
    coeffs,
    coeff_prof,
    thresholds,
    // player_fields: attr key → field name on the player object.
    playerFields: data.player_fields || {},
    raw: data,
  };

  vsPositionMetaCache = new WeakMap();
  vsPotentialMetaCache = new WeakMap();

  if (state.players) {
    for (const p of state.players) { delete p._meta; delete p._metaPa; delete p._metaGroup; }
  }
}

// Populate the position dropdown for the "show meta as" selector.
// Lists the FM positions that exist in the current preset, in a logical top-to-bottom order.
// Called after every applyMetaPreset() and on page load.
function populateMetaGroupSelect() {
  const sel = $('f-meta-group');
  if (!sel) return;
  // Canonical order: GK → defenders → DM → midfielders → attackers
  const knownPos = ['GK', 'DC', 'DL', 'DR', 'WBL', 'WBR', 'DM', 'MC', 'ML', 'MR', 'AML', 'AMC', 'AMR', 'ST'];
  // Only show positions whose group exists in the preset
  const presetGroups = new Set(Object.keys(META_PRESET.coeffs || {}));
  const available = knownPos.filter(pos => presetGroups.has(POS_TO_META_GROUP[pos]));
  sel.innerHTML = `<option value="">${t('metaViewBest')}</option>` +
    available.map(pos => `<option value="${pos}"${state.metaViewPos === pos ? ' selected' : ''}>${pos}</option>`).join('');
}

// Initialise synchronously from the built-in preset so the first render works,
// even before the async JSON fetch completes.
applyMetaPreset(BUILTIN_PRESET);

// ── Meta-score calculation (reads from META_PRESET) ──────────────────────────

// Points-contribution scoring (META_PRESET.coeffs must be set).
// Returns the raw season-points delta relative to an all-attribute-8 baseline player,
// NOT including the proficiency term (that is added in metaScoresByPosition).
// Returns null if no attribute data is available.
function pointsContribution(p, attrs, group) {
  const gCoeffs = META_PRESET.coeffs && META_PRESET.coeffs[group];
  if (!gCoeffs) return null;
  const baseline = META_PRESET.baseline ?? 8;
  const playerFields = META_PRESET.playerFields;
  let sum = 0, hasAny = false;
  for (const [attr, coeff] of Object.entries(gCoeffs)) {
    let v;
    if (attr === 'Pressure') {
      v = p.pressure > 0 ? p.pressure : null;
    } else if (playerFields[attr] !== undefined) {
      const raw = p[playerFields[attr]];
      v = (raw != null && raw > 0 && raw <= 20) ? raw : null;
    } else {
      v = attrs ? (attrs[attr] != null ? attrs[attr] : null) : null;
    }
    if (v == null) continue;
    if (Array.isArray(coeff)) {
      for (const { from, to, coeff: c } of coeff) {
        sum += (Math.max(from, Math.min(to, v)) - Math.max(from, Math.min(to, baseline))) * c;
      }
    } else {
      sum += (v - baseline) * coeff;
    }
    hasAny = true;
  }
  return hasAny ? sum : null;
}

// Returns {group → rawScore} for all meta groups using the given attrs (no proficiency applied).
function rawMetaByGroup(p, attrs) {
  const out = {};
  for (const g of Object.keys(META_PRESET.coeffs)) {
    const s = pointsContribution(p, attrs, g);
    if (s != null) out[g] = s;
  }
  return out;
}

// Returns [{pos, group, label, prof, meta, effectiveMeta}] for each trained FM position,
// sorted by effectiveMeta desc.
//   meta          = raw points delta relative to the all-8 baseline player
//   effectiveMeta = meta + proficiency term (additive; below Accomplished the slope doubles)
// Falls back to posArr with prof=null (no penalty) when posProficiency is absent (old dump).
function metaScoresByPosition(p, attrs) {
  if (!attrs) return [];
  const raw = rawMetaByGroup(p, attrs);
  const profDict = p.posProficiency;
  const hasProfData = profDict && Object.keys(profDict).length > 0;
  const posEntries = hasProfData
    ? Object.entries(profDict)
    : (p.posArr || []).map(pos => [pos, null]);
  const seen = new Set();
  return posEntries
    .map(([pos, prof]) => {
      if (seen.has(pos)) return null;
      seen.add(pos);
      const group = POS_TO_META_GROUP[pos];
      if (!group) return null;
      const meta = raw[group];
      if (meta == null) return null;
      // Points-contribution engine: prof term is purely additive.
      // Below Accomplished (15) the scalar slope doubles.
      let effectiveMeta;
      const cp = META_PRESET.coeff_prof[group] || 0;
      if (Array.isArray(cp) && prof != null) {
        // Piecewise proficiency: clamp-integral over explicit segments.
        // Bottom segment's coeff extends implicitly down to 1.
        const profBase = META_PRESET.profBaseline ?? 20;
        let profTerm = 0;
        for (const { from, to, coeff } of cp) {
          profTerm += (Math.max(from, Math.min(to, prof)) - Math.max(from, Math.min(to, profBase))) * coeff;
        }
        const botSeg = cp[cp.length - 1];
        if (botSeg && botSeg.from > 1) {
          const extTo = botSeg.from - 1;
          profTerm += (Math.max(1, Math.min(extTo, prof)) - Math.max(1, Math.min(extTo, profBase))) * botSeg.coeff;
        }
        effectiveMeta = meta + profTerm;
      } else {
        // Scalar proficiency: (prof − profBaseline) × coeff_prof, slope doubles below Accomplished (15).
        effectiveMeta = meta + (prof != null ? (prof - META_PRESET.profBaseline) * cp * (prof < 15 ? 2 : 1) : 0);
      }
      return { pos, group, label: META_GROUP_LABEL[group], prof, meta, effectiveMeta };
    })
    .filter(Boolean)
    .sort((a, b) => b.effectiveMeta - a.effectiveMeta);
}

// Single number for table sorting and display.
// When state.metaViewPos is set (e.g. 'DC', 'AML'), returns the effective meta for that exact
// FM position — including its own proficiency term — so DC and DL can differ for the same player.
// null = "best" mode: highest effective meta across all trained positions (default).
// Also caches p._metaGroup for colour classification.
function metaScore(p) {
  if (p._meta !== undefined) return p._meta;
  if (!p.attrs) { p._metaGroup = null; return p._meta = null; }
  const positions = metaScoresByPosition(p, p.attrs);
  if (!positions.length) { p._metaGroup = null; return p._meta = null; }
  if (state.metaViewPos) {
    const entry = positions.find(e => e.pos === state.metaViewPos);
    if (entry) { p._metaGroup = entry.group; return p._meta = entry.effectiveMeta; }
    p._metaGroup = null; return p._meta = null;
  }
  p._metaGroup = positions[0].group;
  return p._meta = positions[0].effectiveMeta;
}
// Returns the meta group of the best position (populates cache if needed).
function metaGroup(p) {
  if (p._metaGroup !== undefined) return p._metaGroup;
  metaScore(p);
  return p._metaGroup;
}

// PA-meta: same logic with projected attributes, same proficiency.
// Respects state.metaViewGroup — only considers the selected group when set.
function metaPaScore(p) {
  if (p._metaPa !== undefined) return p._metaPa;
  const cur = metaScore(p);
  if (cur == null) return p._metaPa = null;
  const proj = projectAttrs(p);
  if (!proj) return p._metaPa = cur;
  const positions = metaScoresByPosition(p, proj);
  const relevant = state.metaViewPos
    ? positions.filter(e => e.pos === state.metaViewPos)
    : positions;
  const s = relevant.length ? relevant[0].effectiveMeta : null;
  return p._metaPa = s == null ? cur : Math.max(cur, s);
}

function metaHtml(p) {
  const s = metaScore(p);
  const g = metaGroup(p);
  return s == null ? '<span class="dim">–</span>' : `<span class="${metaClass(s, g)}" data-help="metaLabel">${fmtMeta(s)}</span>`;
}
function metaPaHtml(p) {
  const s = metaPaScore(p);
  const g = metaGroup(p); // use same group as current best position
  return s == null ? '<span class="dim">–</span>' : `<span class="${metaClass(s, g)}" data-help="metaPaHint">${fmtMeta(s)}</span>`;
}
// Groei in de tabel: dezelfde kleurtaal als de ontwikkelgrafiek. Nieuwe spelers krijgen
// "nieuw" in plaats van een streepje, want dát is de informatie die je zoekt.
function growthHtml(p) {
  const g = caGrowth(p);
  if (g == null) return isNewSince(p) ? `<span class="gr-new">${t('grNew')}</span>` : '<span class="dim">–</span>';
  if (g === 0) return '<span class="dim">0</span>';
  return `<span class="gr-${g > 0 ? 'up' : 'down'}">${g > 0 ? '+' : '−'}${Math.abs(g)}</span>`;
}

// ---------- posities & veld ----------
const PITCH = [
  ['ST', 50, 9], ['AML', 17, 24], ['AMC', 50, 24], ['AMR', 83, 24],
  ['ML', 11, 42], ['MC', 50, 42], ['MR', 89, 42], ['DM', 50, 57],
  ['WBL', 11, 64], ['WBR', 89, 64], ['DL', 24, 78], ['DC', 50, 80],
  ['DR', 76, 78], ['GK', 50, 93],
];
const activePos = new Set();
// Keep the sidebar filters independent for each table tab. The old shared sidebar let
// a search in Players silently carry over to Shortlist or My Player.
const FILTER_TAB_MODES = new Set(['players', 'staff', 'shortlist', 'myplayer']);
const FILTER_TAB_STORAGE_KEY = 'fmss_filter_tabs_v1';
let filterTabSnapshots = {};
try {
  const stored = JSON.parse(localStorage.getItem(FILTER_TAB_STORAGE_KEY) || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) filterTabSnapshots = stored;
} catch { /* ignore a malformed saved filter set */ }
if (HIST_PERIODS.includes(state.histPeriod)) $('f-hist-period').value = state.histPeriod;
if ($('f-prof-threshold')) $('f-prof-threshold').value = state.profThreshold;
const FILTER_CONTROL_IDS = [...document.querySelectorAll('#filters [id^="f-"]')].map(el => el.id);
const FILTER_CONTROL_DEFAULTS = Object.fromEntries(FILTER_CONTROL_IDS.map(id => {
  const el = $(id);
  return [id, el.type === 'checkbox' ? { checked: el.checked } : { value: el.value }];
}));
function readFilterControls() {
  const controls = {};
  for (const id of FILTER_CONTROL_IDS) {
    const el = $(id);
    controls[id] = el.type === 'checkbox' ? { checked: el.checked } : { value: el.value };
  }
  return controls;
}
function writeFilterControls(controls = FILTER_CONTROL_DEFAULTS) {
  for (const id of FILTER_CONTROL_IDS) {
    const el = $(id), saved = controls[id] || FILTER_CONTROL_DEFAULTS[id];
    if (el.type === 'checkbox') el.checked = !!saved?.checked;
    else if (saved && Object.hasOwn(saved, 'value')) el.value = saved.value ?? '';
  }
}
function persistFilterTab(mode = state.mode) {
  if (!FILTER_TAB_MODES.has(mode) || (!state.players.length && !state.staff.length)) return;
  const rules = mode === 'staff' ? state.advStaffF : state.advF;
  filterTabSnapshots[mode] = {
    controls: readFilterControls(), positions: [...activePos],
    profThreshold: state.profThreshold, myTeam: state.myTeam,
    adv: (rules || []).map(rule => ({ ...rule })),
  };
  try { localStorage.setItem(FILTER_TAB_STORAGE_KEY, JSON.stringify(filterTabSnapshots)); } catch { }
}
function restoreFilterTab(mode) {
  if (!FILTER_TAB_MODES.has(mode)) return;
  const snapshot = filterTabSnapshots[mode];
  const legacyRole = !snapshot && mode === 'players' ? (state.role || '') : '';
  const legacyMetaViewPos = !snapshot && mode === 'players' ? state.metaViewPos : null;
  writeFilterControls(snapshot?.controls || FILTER_CONTROL_DEFAULTS);
  if (legacyRole) $('f-role').value = legacyRole;
  if (legacyMetaViewPos) $('f-meta-group').value = legacyMetaViewPos;
  activePos.clear();
  for (const pos of snapshot?.positions || []) activePos.add(pos);
  document.querySelectorAll('.pos-node').forEach(node => node.classList.toggle('on', activePos.has(node.dataset.pos)));
  state.profThreshold = Math.max(1, Math.min(20, parseInt(snapshot?.profThreshold ?? $('f-prof-threshold').value, 10) || 15));
  $('f-prof-threshold').value = state.profThreshold;
  state.myTeam = snapshot?.myTeam || 'all';
  state.role = $('f-role').value || '';
  localStorage.setItem('fmss_role', state.role);
  state.metaViewPos = $('f-meta-group').value || null;
  localStorage.setItem('fmss_metaviewpos', state.metaViewPos || '');
  const historyPeriod = $('f-hist-period').value;
  if (HIST_PERIODS.includes(historyPeriod)) state.histPeriod = historyPeriod;
  if (snapshot && Array.isArray(snapshot.adv)) {
    if (mode === 'staff') state.advStaffF = snapshot.adv.map(rule => ({ ...rule }));
    else state.advF = snapshot.adv.map(rule => ({ ...rule }));
  } else if (mode === 'shortlist' || mode === 'myplayer') {
    state.advF = [];
  }
  updateAdvBtn();
}
function buildPitch() {
  const nodes = PITCH.map(([pos, x, y]) =>
    `<g class="pos-node" data-pos="${pos}" transform="translate(${x},${y})">
       <circle r="7.5"></circle><text>${pos}</text></g>`).join('');
  $('pitch-wrap').innerHTML =
    `<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">
       <rect x="1" y="1" width="98" height="102" rx="3" fill="#12301c" stroke="#2a3441"/>
       <line x1="1" y1="52" x2="99" y2="52" stroke="#2a4a34"/>
       <circle cx="50" cy="52" r="10" fill="none" stroke="#2a4a34"/>
       <rect x="30" y="1" width="40" height="14" fill="none" stroke="#2a4a34"/>
       <rect x="30" y="89" width="40" height="14" fill="none" stroke="#2a4a34"/>
       ${nodes}
     </svg>`;
  $('pitch-wrap').querySelectorAll('.pos-node').forEach(n => {
    n.onclick = () => {
      const pos = n.dataset.pos;
      if (activePos.has(pos)) { activePos.delete(pos); n.classList.remove('on'); }
      else { activePos.add(pos); n.classList.add('on'); }
      applyFilters();
    };
  });
  const thr = $('f-prof-threshold');
  if (thr) {
    thr.value = state.profThreshold;
    thr.oninput = () => {
      const v = Math.max(1, Math.min(20, parseInt(thr.value, 10) || 1));
      state.profThreshold = v;
      localStorage.setItem('fmss_profthreshold', v);
      persistFilterTab();
      if (activePos.size) applyFilters();
    };
  }
}

// ---------- data laden ----------
// Streamende dump-parser: knipt meta/speler-, staf- en clubobjecten één voor één uit de bytestroom.
// Nodig omdat een dump van een volledig geladen database (600k+ personen, honderden MB's)
// niet in één JavaScript-string of JSON.parse past (V8-limiet ~512 MB per string).
// Leunt op de vaste dumpstructuur: meta, players, staff en clubs als top-level onderdelen.
// String-interning: JSON.parse maakt voor elke voorkomen een nieuw string-object, ook
// als de inhoud identiek is. Club-, divisie- en datumwaarden komen in een grote dump
// honderdduizenden keren voor; één canonieke instantie per waarde scheelt honderden MB
// piekgeheugen bij mega-dumps (600k+ personen).
const INTERN_KEYS = ['club', 'ownerClub', 'div', 'pos', 'foot', 'expires', 'dob', 'job'];
function internStrings(obj, pool) {
  for (const k of INTERN_KEYS) {
    const v = obj[k];
    if (typeof v === 'string') { const c = pool.get(v); if (c !== undefined) obj[k] = c; else pool.set(v, v); }
  }
  for (const arrK of ['nat', 'posArr']) {
    const a = obj[arrK];
    if (a) for (let i = 0; i < a.length; i++) { const c = pool.get(a[i]); if (c !== undefined) a[i] = c; else pool.set(a[i], a[i]); }
  }
}

async function parseDumpStream(resp, total, onProgress) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  const data = { meta: {}, players: [], staff: [], clubs: [] };
  const pool = new Map();
  let buf = '', pos = 0;            // onverwerkte staart + scanpositie daarin
  let depth = 0, inStr = false, esc = false;
  let key = '', keyStart = -1;      // top-level sleutel (op diepte 1)
  let curKey = null;                // actieve sectie: meta | players | staff | clubs
  let elemStart = -1, elemDepth = 0;
  let got = 0;
  let lastYield = performance.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    onProgress(got);
    buf += dec.decode(value, { stream: true });
    for (; pos < buf.length; pos++) {
      const c = buf.charCodeAt(pos);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92) esc = true;                          // \
        else if (c === 34) {                                    // sluitende "
          inStr = false;
          if (keyStart >= 0) { key = buf.slice(keyStart, pos); keyStart = -1; }
        }
      } else if (c === 34) {                                    // openende "
        inStr = true;
        if (depth === 1 && elemStart < 0) keyStart = pos + 1;
      } else if (c === 58) {                                    // :
        if (depth === 1 && key) { curKey = key; key = ''; }
      } else if (c === 123 || c === 91) {                       // { of [
        depth++;
        if (elemStart < 0 && c === 123 &&
            ((curKey === 'meta' && depth === 2) ||
             ((curKey === 'players' || curKey === 'staff' || curKey === 'clubs') && depth === 3))) {
          elemStart = pos; elemDepth = depth;
        }
      } else if (c === 125 || c === 93) {                       // } of ]
        if (elemStart >= 0 && depth === elemDepth) {
          const obj = JSON.parse(buf.slice(elemStart, pos + 1));
          if (curKey === 'meta') data.meta = obj;
          else if (curKey === 'clubs') {
            for (const k of ['name', 'shortName', 'nation', 'div']) {
              const value = obj[k];
              if (typeof value === 'string') { const canonical = pool.get(value); if (canonical !== undefined) obj[k] = canonical; else pool.set(value, value); }
            }
            data.clubs.push(obj);
          } else { internStrings(obj, pool); data[curKey].push(obj); }
          elemStart = -1;
        }
        depth--;
      }
    }
    // Verwerkte deel weggooien; loopt er nog een element of sleutel, dan vanaf daar bewaren.
    const cut = Math.min(elemStart >= 0 ? elemStart : buf.length, keyStart >= 0 ? keyStart - 1 : buf.length, pos);
    if (cut > 0) {
      buf = buf.slice(cut);
      pos -= cut;
      if (elemStart >= 0) elemStart -= cut;
      if (keyStart >= 0) keyStart -= cut;
    }
    // Yield periodically so the UI can paint progress and handle input while parsing.
    if (performance.now() - lastYield >= 25) {
      await new Promise(r => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  // Volledig = de buitenste accolade is netjes gesloten (diepte terug op 0) en er kwam
  // überhaupt data binnen. Een afgebroken stream of half geschreven bestand faalt hier.
  data._complete = depth === 0 && !inStr && got > 0;
  return data;
}

// Laatst opgehaalde /api/status (voor het probleemrapport: dump-grootte op schijf) en
// de laatste laadfout, indien er wél een dump ligt maar hij niet ingelezen kon worden.
let lastStatus = null;
let loadError = null;

// A shortlist may contain a real player which is currently clubless. FM also keeps
// not-yet-created newgens in memory; those records are filtered from the normal list
// below, but must remain available when a saved shortlist explicitly refers to them.
function normalizeShortlistIds(values) {
  return new Set((Array.isArray(values) ? values : [...(values || [])])
    .map(Number)
    .filter(Number.isSafeInteger)
    .filter(id => id > 0 && id <= 0xffffffff));
}

function restoreShortlistPlayers(ids) {
  const wanted = ids instanceof Set ? ids : normalizeShortlistIds(ids);
  const visible = new Set(state.players.map(p => Number(p.id)));
  for (const p of state.allPlayers) {
    const id = Number(p.id);
    if (wanted.has(id) && !visible.has(id)) {
      state.players.push(p);
      visible.add(id);
    }
  }
}

async function loadDump(force = false) {
  let st = null;
  try {
    st = await (await fetch('/api/status')).json();
    lastStatus = st;
    if (!st.hasDump) {
      $('dump-info').textContent = '';
      loadError = null; renderEmptyState();
      return false;
    }
    // Crash-detector: de marker wordt vóór het parsen gezet en alleen bij succes of een
    // nette fout weer verwijderd. Staat hij er bij de start nog, dan is de vorige poging
    // hard gecrasht (tab-OOM bij een mega-dump laat geen JS-fout achter). Dan niet blind
    // opnieuw proberen, maar een hint tonen; "Opnieuw proberen" forceert alsnog een load.
    if (!force && localStorage.getItem('fmss_loadmark')) {
      localStorage.removeItem('fmss_loadmark');
      loadError = { msg: t('esErrCrash'), size: st.dumpSize, crash: true };
      $('empty-state').classList.remove('hidden');
      renderEmptyState();
      return false;
    }
    localStorage.setItem('fmss_loadmark', '1');
    const b = $('banner');
    b.className = 'scanning'; b.innerHTML = bannerMsg('hourglass', t('loading')); b.onclick = null;
    // Streamend binnenhalen én parsen, met echte voortgang (bytes / Content-Length).
    const resp = await fetch('/api/dump');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const total = Number(resp.headers.get('Content-Length')) || 0;
    let data;
    if (resp.body && total > 0) {
      let lastUi = 0;
      data = await parseDumpStream(resp, total, got => {
        const now = performance.now();
        if (now - lastUi > 100) {   // UI hooguit 10×/s verversen
          lastUi = now;
          const mb = `${t('loading')} ${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`;
          b.innerHTML = bannerProgress('hourglass', mb, got / total);
        }
      });
    } else {
      data = await resp.json();
      data._complete = true;   // JSON.parse gooit zelf al bij een afgekapt bestand
    }
    // Volledigheidscheck: een dump die midden in het schrijven is gelezen (of afgebroken
    // stream) mag nooit stilletjes als geldige — maar halve — spelerslijst doorgaan.
    // "generated" staat sinds de allereerste release in elk metablok; "pluginVersion" pas
    // sinds plugin 0.1.34. Op die laatste weigeren gooide complete dumps van oudere plugins
    // weg met een misleidende "onvolledig"-melding (issue #8) — die krijgen nu een
    // waarschuwingsbanner (zie renderVerWarn) in plaats van een fout.
    if (!data._complete || !data.meta || !data.meta.generated)
      throw new Error(t('dumpIncomplete'));
    b.className = 'hidden';
    // Spookrecords eruit: FM genereert newgens alvast in het geheugen (o.a. voor de
    // jeugdintake) vóórdat ze in de spelwereld bestaan. Kenmerk: clubloos én reputatie
    // op de 0xFFFF-sentinel ("niet ingesteld"). Ze ogen als transfervrije parels maar
    // zijn in de game onvindbaar en niet te tekenen; echte clublozen hebben wél een
    // reputatiewaarde.
    // Keep the raw player array as a lookup pool. The normal list still excludes FM's
    // pre-generated ghost players, except when a saved shortlist explicitly contains
    // their ID; otherwise a valid three-player shortlist could appear as only two.
    state.allPlayers = Array.isArray(data.players) ? data.players : [];
    const savedShortlistIds = normalizeShortlistIds([
      ...state.shortlist,
      ...(Array.isArray(data.meta?.gameShortlist) ? data.meta.gameShortlist : []),
    ]);
    state.players = state.allPlayers.filter(p => p.club || p.worldRep !== 0xFFFF || savedShortlistIds.has(Number(p.id)));
    const seniorSquadIds = new Map();
    for (const p of state.allPlayers) if (p.clubId && p.teamType === 0) {
      const id = Number(p.clubId);
      if (!seniorSquadIds.has(id)) seniorSquadIds.set(id, new Set());
      seniorSquadIds.get(id).add(Number(p.id));
    }
    state._clubSeniorSquadCounts = new Map([...seniorSquadIds].map(([id, ids]) => [id, ids.size]));
    state.staff = data.staff || [];
    if (state.players.length) {
      const knownPlayerIds = new Set(state.players.map(p => Number(p.id)));
      const playerShortlist = new Set([...state.shortlist].map(Number).filter(id => knownPlayerIds.has(id)));
      if (playerShortlist.size !== state.shortlist.size) {
        state.shortlist = playerShortlist;
        localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
        $('sl-count').textContent = state.shortlist.size;
      }
    }
    state.clubs = data.clubs || [];
    state.meta = data.meta || {};
    // FM's current visible player/search result is authoritative when the plugin found it.
    // This imports thousands of in-game Interested results without selecting rows first.
    if (state.meta.gameShortlistFound && Array.isArray(state.meta.gameShortlist)) {
      const known = new Set(state.players.map(p => Number(p.id)));
      // JSON from older/newer plugin builds may contain numeric IDs as strings.
      // Normalize before matching so a valid filtered game result is never dropped.
      state.shortlist = normalizeShortlistIds(state.meta.gameShortlist);
      state.shortlist = new Set([...state.shortlist].filter(id => known.has(id)));
      localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
      $('sl-count').textContent = state.shortlist.size;
      showToast(`${state.shortlist.size} ← FM24`, 'check');
      $('shortlist-sync-status').textContent = tf('syncfound', { n: state.shortlist.size });
    } else {
      $('shortlist-sync-status').textContent = t('syncmissing');
    }
    state._wageCeil = undefined;   // loonplafond opnieuw berekenen voor deze dump
    state._clubWages = null;       // loonrang-cache (vraagprijs) opnieuw opbouwen
    state._nowTs = undefined;      // "nu"-tijdstip volgt de nieuwe in-game datum (monthsUntil)
    _expTsCache.clear();           // contractdatum → timestamp-cache leegmaken
    // Per-speler memo's (_meta/_ev/_fee/_int/_q) hoeven niet gewist: de parser levert
    // verse objecten, de oude nemen hun cache mee het geheugen uit.
    // Peiljaar (voor leeftijdsberekening) automatisch uit de in-game datum; geen UI-veld meer.
    if (state.meta.gameDate) {
      const g = parseGameDate(state.meta.gameDate);
      state.refYear = state.meta.gameYear || g.getFullYear();
      state.refDoy = Math.floor((g - new Date(g.getFullYear(), 0, 0)) / 864e5);
    } else if (state.meta.gameYear) {
      state.refYear = state.meta.gameYear;
    }
    state.dumpStamp = st.dumpTime;
    localStorage.removeItem('fmss_loadmark');   // geladen: geen crash
    renderDumpInfo();
    renderClubBadge();
    renderVerWarn();
    renderMyTeamChips();
    loadError = null; renderEmptyState();
    $('empty-state').classList.add('hidden');
    buildStaffRoles();
    buildFootOptions();
    buildDivisions();   // divisiefilter vullen zodra er dump-data met divisies is
    restoreFilterTab(state.mode);
    buildGenderFilter();
    renderMyTeamChips();
    renderTable();      // nieuwe dump kan de kolomset raken (bv. groei-kolom)
    applyFilters();
    // Historie komt ná de eerste render binnen: de lijst hoeft er niet op te wachten.
    // Trends bijwerken en daarna pas de groeidata ophalen: de momentopname van déze dump
    // moet erin staan, anders ontbreekt de nieuwste datum en klopt "nieuw sinds" niet.
    // Allemaal ná de eerste render, de lijst hoeft er niet op te wachten.
    setTimeout(() => postHistorySnapshot().then(loadHistDeltas).then(() => {
      renderDevSection();
      if (histReady()) { renderTable(); applyFilters(); renderIntakeBar(); }
    }), 100);
    // Seizoensrapport eerst (rolt het in-game seizoen over 1 juli?), daarna pas de
    // gloed: die blijft vanzelf stil zolang het rapportkaartje open staat.
    const loads = (+localStorage.getItem('fmss_loads') || 0) + 1;
    localStorage.setItem('fmss_loads', String(loads));
    maybeSeasonReport();
    if (loads >= 3) coffeeGlow();
    return true;
  } catch (e) {
    console.error('loadDump:', e);
    localStorage.removeItem('fmss_loadmark');   // nette fout, geen crash: marker weg
    $('dump-info').textContent = '!';
    // Er ligt (waarschijnlijk) wél een dump, maar het inlezen faalde. Maak dat zichtbaar
    // op het lege scherm i.p.v. het stil weg te slikken; anders blijft de gebruiker met
    // een leeg scherm en de misleidende "druk op Nieuwe data"-stappen achter.
    if (st && st.hasDump) {
      loadError = { msg: String((e && e.message) || e), size: st.dumpSize };
      const b = $('banner');
      b.className = 'scanning error'; b.onclick = null;
      b.innerHTML = bannerMsg('warning', t('esErrTitle'));
      $('empty-state').classList.remove('hidden');
    }
    renderEmptyState();
    return false;
  }
}

// ---------- ontwikkel-historie (trends) ----------
// Stuurt na elke geladen dump een compacte momentopname (id → [ca, pa, waarde]) naar de
// server, die delta-only opslaat (zie server.js). Best effort en buiten het laadpad om;
// per dump maar één keer (herladen van dezelfde dump slaat niets dubbel op).
let historySnapshotInFlight = null;
let dataClearInProgress = false;
async function postHistorySnapshot() {
  try {
    if (dataClearInProgress) return;
    const gd = state.meta.gameDate;
    if (!gd || !state.players.length) return;
    if (localStorage.getItem('fmss_hist_at') === String(state.dumpStamp)) return;
    const compact = {};
    for (const p of state.players) compact[p.id] = [p.ca ?? 0, p.pa ?? 0, p.value ?? null];
    const request = fetch('/api/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manager: state.meta.manager || 'default', gameDate: gd, players: compact }),
    });
    historySnapshotInFlight = request;
    const r = await request;
    if (r.ok) localStorage.setItem('fmss_hist_at', String(state.dumpStamp));
  } catch { /* historie is nice-to-have, nooit het laden storen */ }
  finally { historySnapshotInFlight = null; }
}

// Toont op het lege scherm ofwel de normale "nog geen data"-stappen, ofwel — als er een
// dump op schijf staat die niet ingelezen kon worden — een foutblok met de oorzaak, de
// dump-grootte en knoppen om opnieuw te proberen of het te melden. Zo is een mislukte
// load nooit meer een stil, onverklaard leeg scherm.
// Eerste FM-start na installatie: BepInEx bouwt dan zijn interop-map, wat 1-3 minuten
// duurt achter een zwart consolevenster. Zolang die map ontbreekt heeft "druk op Nieuwe data" geen
// zin, en denken mensen dat FM vastloopt (meest gemelde probleem, juli 2026). Daarom in
// dat geval een eigen uitleg in plaats van de gewone stappen.
let setupState = null;
function checkSetupState() {
  fetch('/api/setup').then(r => r.json()).then(s => { setupState = s; renderEmptyState(); }).catch(() => {});
}
function renderEmptyState() {
  const normal = $('es-normal'), errBox = $('es-error'), setupBox = $('es-setup');
  if (!errBox) return;
  const needsFirstRun = !loadError && setupState && setupState.known
    && setupState.pluginInstalled && !setupState.interopReady;
  if (setupBox) {
    setupBox.classList.toggle('hidden', !needsFirstRun);
    if (needsFirstRun) setupBox.innerHTML =
      `<h2>${escHtml(t('esSetupTitle'))}</h2><p>${escHtml(t('esSetupBody'))}</p>` +
      `<p class="es-setup-hint">${escHtml(t('esSetupHint'))}</p>`;
  }
  if (!loadError) {
    errBox.classList.add('hidden');
    if (normal) normal.classList.toggle('hidden', needsFirstRun);
    return;
  }
  if (normal) normal.classList.add('hidden');
  if (setupBox) setupBox.classList.add('hidden');
  const sizeLine = loadError.size
    ? `<p class="es-err-size">${tf('esErrSize', { mb: (loadError.size / 1048576).toFixed(0) })}</p>` : '';
  // Crash (tab-OOM): de melding ís de uitleg + tip; er is geen technisch foutdetail.
  errBox.innerHTML =
    `<h2>${escHtml(t('esErrTitle'))}</h2>` +
    `<p class="es-err-msg">${escHtml(loadError.crash ? loadError.msg : t('esErrBig'))}</p>` +
    sizeLine +
    (loadError.crash ? '' : `<pre class="es-err-detail">${escHtml(loadError.msg)}</pre>`) +
    `<div class="es-help">` +
      `<button id="es-err-reload">${escHtml(t('esErrReload'))}</button>` +
      `<button id="es-err-fetch">${escHtml(t('fetch'))}</button>` +
      `<button id="es-err-report">${escHtml(t('reportBug'))}</button>` +
    `</div>`;
  errBox.classList.remove('hidden');
  $('es-err-reload').onclick = () => loadDump(true);   // force: langs de crash-detector
  // Uitweg die er niet was (issue #8): een verse dump vragen, zelfde route als de knop
  // "Nieuwe data" in de balk — mét de FM-draait-check en de niet-opgepikt-time-out.
  $('es-err-fetch').onclick = () => $('btn-fetch').onclick();
  $('es-err-report').onclick = reportBug;
}
function renderDumpInfo() {
  const gd = $('game-date');
  if (!state.dumpStamp) { $('dump-info').textContent = ''; if (gd) gd.textContent = ''; return; }
  const when = new Date(state.dumpStamp);
  const n = state.players.length.toLocaleString();
  $('dump-info').textContent = n;
  $('dump-info').title = `${state.players.length.toLocaleString()} ${t('playersWord')} · ${state.staff.length.toLocaleString()} ${t('staffWord')}\n${when.toLocaleString()}`;
  // In-game datum naast het spelersaantal. "memory" = exact uit het geheugen; "derived" =
  // afgeleid (jaar zeker, dag benaderd) → tilde + tooltip zodat het verschil duidelijk is.
  if (gd) {
    const ds = state.meta.gameDate;
    if (!ds) { gd.innerHTML = ''; gd.title = ''; }
    else {
      const derived = state.meta.gameDateSource !== 'memory';
      const d = new Date(ds);
      const txt = isNaN(d) ? ds : d.toLocaleDateString(uiLocale(),
        { day: 'numeric', month: 'short', year: 'numeric' });
      gd.innerHTML = icon('calendar', 12) + ' ' + escHtml((derived ? '~ ' : '') + txt);
      gd.title = derived ? t('gameDateDerived') : t('gameDateMemory');
    }
  }
}
// Waarschuwing als de dump uit een andere FM-versie komt dan waarop de offsets zijn gepind:
// de geheugen-uitlezing kan dan stilletjes verkeerde waarden geven. Zelfde banner voor een
// dump van een plugin ouder dan 0.1.34 (geen pluginVersion in het metablok): wel laden,
// maar aanraden verse data op te halen.
function renderVerWarn() {
  const el = $('ver-warn');
  const m = state.meta;
  if (m.gameVersion && m.versionOk === false) {
    el.innerHTML = bannerMsg('warning', tf('verWarn', { v: m.gameVersion, s: m.supportedVersion || '26.3' }));
    el.classList.remove('hidden');
  } else if (m.generated && !m.pluginVersion) {
    el.innerHTML = bannerMsg('warning', t('verWarnOldDump'));
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}
function renderClubBadge() {
  const mgr = state.meta.manager, club = state.meta.myClub, rep = state.meta.myClubRep;
  // FM-data (namen uit het geheugen) altijd escapen vóór innerHTML.
  $('club-badge').innerHTML = (mgr || club) ? `${mgr ? escHtml(mgr) + ' · ' : ''}<b>${escHtml(club || '?')}</b>` : '';
  $('club-badge').title = t('clickClubFilter') + (rep ? ` · ${t('repWord')} ${rep}` : '');
}
function buildStaffRoles() {
  const cur = $('f-staffrole').value;
  const byJob = new Map();
  for (const s of state.staff) {
    const key = staffRoleKey(s);
    if (key && !byJob.has(key)) byJob.set(key, s);
  }
  const items = [...byJob].map(([v, s]) => ({ v, l: jobLabel(s) }))
    .sort((a, b) => a.l.localeCompare(b.l, uiLocale()));
  $('f-staffrole').innerHTML = `<option value="">${t('all')}</option>` +
    items.map(x => `<option value="${escHtml(x.v)}">${escHtml(x.l)}</option>`).join('');
  const oldRole = state.staff.find(s => s.job === cur);
  $('f-staffrole').value = items.some(x => x.v === cur) ? cur : oldRole ? staffRoleKey(oldRole) : '';
}
// Geslacht-filter: alleen zichtbaar als de geladen data écht gemengd is (scan met
// "Beide"); in een puur mannen- of vrouwenbestand is hij ruis. Waardes m/v zijn
// taalvast, de labels vertalen mee via dbMen/dbWomen.
function buildGenderFilter() {
  const rows = state.mode === 'staff' ? state.staff : state.players;
  let men = false, women = false;
  for (const p of rows) { if (p.gender === 1) women = true; else men = true; if (men && women) break; }
  const mixed = men && women;
  $('fg-gender').style.display = mixed ? '' : 'none';
  if (!mixed && $('f-gender').value) { $('f-gender').value = ''; }
}

// Voetkeuze uit de dump zelf: de plugin leest de tekst zoals FM hem toont, dus die is
// afhankelijk van de speltaal ("Rechts" / "Right"). Opties opbouwen uit de aanwezige
// waarden houdt het filter goed in elke taal; het label komt uit footLabel waar we hem
// kennen, anders gewoon de waarde uit het geheugen.
const FOOT_ORDER = { footR: 0, footL: 1, footB: 2 };
function buildFootOptions() {
  const cur = $('f-foot').value;
  const vals = [...new Set(state.players.map(p => p.foot).filter(Boolean))]
    .sort((a, b) => (FOOT_ORDER[FOOT_KEY[a.toLowerCase()]] ?? 9) - (FOOT_ORDER[FOOT_KEY[b.toLowerCase()]] ?? 9));
  $('f-foot').innerHTML = `<option value="">${t('all')}</option>` +
    vals.map(v => `<option value="${escHtml(v)}">${escHtml(footLabel({ foot: v }))}</option>`).join('');
  $('f-foot').value = vals.includes(cur) ? cur : '';
}
// FM reuses competition names across countries (e.g. Premier League in England and Egypt).
// Keep the club's nation in the division identity so those competitions cannot be merged.
let clubCatalogSource = null;
let clubCatalogCache = null;
function clubCatalogById() {
  const clubs = state.clubs || [];
  // Division labels are used inside per-player filtering and sorting. Rebuilding this
  // map for every player made a division search O(players × clubs), freezing large saves.
  if (clubs === clubCatalogSource && clubCatalogCache) return clubCatalogCache;
  clubCatalogSource = clubs;
  clubCatalogCache = new Map(clubs.filter(c => Number(c.id) > 0).map(c => [Number(c.id), c]));
  return clubCatalogCache;
}
function divisionInfo(name, nation, id) {
  const raw = (name || '').trim();
  const country = (nation || '').trim();
  if (!raw) return null;
  const divisionId = Number(id) > 0 ? Number(id) : 0;
  return {
    raw,
    nation: country,
    divisionId,
    key: divisionId ? `id:${divisionId}` : `${normStr(country)}\u0000${normStr(raw)}`,
    label: country ? `${raw} (${country})` : raw,
  };
}
function playerDivisionInfo(p, clubsById = clubCatalogById()) {
  const club = Number(p.clubId) > 0 ? clubsById.get(Number(p.clubId)) : null;
  return divisionInfo(p.div, club?.nation, p.divisionId || club?.divisionId);
}
function playerDivisionLabel(p) {
  if (p._divisionLabel === undefined) p._divisionLabel = playerDivisionInfo(p)?.label || p.div || '';
  return p._divisionLabel;
}
// Division suggestions use the divisions supplied by the FM24 reader and rank them by
// the strongest club reputation in each division. Normalize names for tolerant searching.
function buildDivisions() {
  const byDiv = new Map();
  const clubsById = clubCatalogById();
  const seniorPlayers = state.players.filter(p => p.teamType == null || p.teamType === 0);
  const activeClubIds = new Set(seniorPlayers.map(p => Number(p.clubId) || 0).filter(id => id > 0));
  const add = (info, rep, amount = 1) => {
    if (!info) return;
    let d = byDiv.get(info.key);
    if (!d) byDiv.set(info.key, d = { ...info, reputation: 0, count: 0 });
    d.count += amount;
    d.reputation = Math.max(d.reputation, rep || 0);
  };
  for (const c of state.clubs || [])
    if (c.div && (!activeClubIds.size || activeClubIds.has(Number(c.id)))) add(divisionInfo(c.div, c.nation, c.divisionId), +c.reputation || 0);
  for (const p of seniorPlayers) {
    add(playerDivisionInfo(p, clubsById), +p.clubRep || 0);
  }
  // FM24 does not expose a verified competition-reputation field here, so use the highest
  // club reputation in each division. The managed club's divisions receive a small tie-break.
  const myClub = (state.meta.myClub || '').toLowerCase();
  const myClubId = Number(state.meta.myClubId) || 0;
  state.myDivs = new Set([
    ...(state.clubs || []).filter(c => c.div && (!activeClubIds.size || activeClubIds.has(Number(c.id))) && (myClubId ? Number(c.id) === myClubId : normStr(c.name) === normStr(myClub))).map(c => divisionInfo(c.div, c.nation, c.divisionId)?.label).filter(Boolean),
    ...seniorPlayers.filter(p => p.div && (myClubId ? Number(p.clubId) === myClubId : normStr(p.club) === normStr(myClub))).map(p => playerDivisionInfo(p, clubsById)?.label).filter(Boolean),
  ]);
  state.divIndex = [...byDiv.entries()]
    .map(([, d]) => ({ ...d, name: d.label, norm: normStr(d.label), queryNorm: normStr(d.raw), strength: d.reputation, mine: state.myDivs.has(d.label) }))
    .sort((a, b) => b.strength - a.strength || b.count - a.count || a.label.localeCompare(b.label, uiLocale()));
  const wrap = $('fg-div');
  wrap.style.display = state.divIndex.length ? '' : 'none';
}
// Normaliseer voor zoeken: kleine letters, diacrieten weg, alleen letters/cijfers/spaties.
function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Levenshtein (met vroege afkap) voor typo-tolerantie op woordniveau.
function editDist(a, b, max) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i], best = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      cur[j] = c; if (c < best) best = c;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[n];
}
// Score een divisie tegen de (genormaliseerde) query. Hoger = betere match; -1 = geen match.
// Combineert matchkwaliteit met competitiesterkte (tiebreak), en tolereert typo's per woord.
function scoreDiv(entry, q) {
  // Sterkte weegt fors bínnen een matchklasse (300 punten = het hele bereik), maar overbrugt
  // nooit een klasse: zo staat de sterke "…Eredivisie" boven een zwakke "Eredivisie Guinea"
  // terwijl een echte substring-match altijd boven een losse typo-match blijft.
  // Eigen competitie krijgt een vaste bonus bovenop de sterkte, zodat "mijn" Eredivisie
  // altijd boven gelijknamige buitenlandse competities staat en nooit uit de top-N valt.
  const name = entry.norm, str = Math.min(300, entry.strength / 40) + (entry.active ? 800 : 0) + (entry.mine ? 400 : 0);
  if (!q) return str;                                     // lege query: puur op sterkte
  // klasse 1: hele query komt aaneengesloten voor. Positie weegt fors mee (een prefix-match
  // als "Premier League" verslaat een diepe match als "…Reservecompetitie Premier Divisie",
  // ook al is die laatste "van mij"); de eigen-competitie-bonus tipt alleen gelijkwaardige.
  const idx = name.indexOf(q);
  if (idx >= 0) return 3000 + str - Math.min(450, idx * 15);
  // klasse 2: een los woord begint met de query, of met een kleine typo
  let hit = false;
  for (const w of name.split(' ')) {
    if (w.startsWith(q)) { hit = true; break; }
    const tol = q.length >= 6 ? 2 : q.length >= 4 ? 1 : 0;
    if (tol && editDist(q, w.slice(0, q.length + tol), tol) <= tol) { hit = true; break; }
  }
  if (hit) return 2000 + str;
  // klasse 3: losse letters in volgorde (subsequence) als laatste redmiddel
  let i = 0; for (const c of name) if (c === q[i]) i++;
  return i === q.length ? 1000 + str : -1;
}
function renderCompetitionSuggest(inputId, boxId, entries, selection) {
  const input = $(inputId), box = $(boxId);
  if (!input || !box) return;
  const q = normStr(input.value);
  const idx = entries || [];
  const ranked = idx.map(e => ({ e, s: scoreDiv(e, q) })).filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s).slice(0, 8);
  if (!ranked.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = ranked.map((x, i) =>
    `<div class="ds-item" data-v="${escHtml(x.e.name)}" data-i="${i}">${escHtml(x.e.name)}</div>`).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.ds-item').forEach(el => el.onmousedown = e => {
    e.preventDefault();
    input.value = el.dataset.v;
    box.classList.add('hidden');
    selection();
  });
}
function bindCompetitionSuggest(inputId, boxId, getEntries, onInput, onSelection = onInput) {
  const input = $(inputId), box = $(boxId);
  if (!input || !box) return;
  let selected = -1, timer = null;
  const render = () => { selected = -1; renderCompetitionSuggest(inputId, boxId, getEntries(), onSelection); };
  input.addEventListener('input', () => {
    render(); clearTimeout(timer); timer = setTimeout(onInput, 150);
  });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
  input.addEventListener('keydown', e => {
    if (box.classList.contains('hidden')) {
      if (e.key === 'Enter') { clearTimeout(timer); onInput(); }
      return;
    }
    const items = [...box.querySelectorAll('.ds-item')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('sel', i === selected));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = items[selected] || items[0];
      if (pick) { input.value = pick.dataset.v; box.classList.add('hidden'); onSelection(); }
      else { box.classList.add('hidden'); onInput(); }
    } else if (e.key === 'Escape') box.classList.add('hidden');
  });
}
// Rol-keuze: gegroepeerd op linie zodat de lijst overzichtelijk blijft.
function buildRoleSelect() {
  const groups = [
    ['GK', ['gk', 'sk']], ['DEF', ['cd', 'bpd', 'fb', 'wb']],
    ['MID', ['dm', 'dlp', 'bwm', 'cm', 'b2b', 'ap']], ['AANV', ['wing', 'if', 'am', 'af', 'poacher', 'tm', 'cf']],
  ];
  const headsBy = {
    nl: { GK: 'Keeper', DEF: 'Verdediging', MID: 'Middenveld', AANV: 'Aanval' },
    en: { GK: 'Goalkeeper', DEF: 'Defence', MID: 'Midfield', AANV: 'Attack' },
    fr: { GK: 'Gardien', DEF: 'Défense', MID: 'Milieu', AANV: 'Attaque' },
    de: { GK: 'Torwart', DEF: 'Abwehr', MID: 'Mittelfeld', AANV: 'Angriff' },
  };
  const H = headsBy[state.lang] || headsBy.en;
  let html = `<option value="">${t('roleAny')}</option>`;
  for (const [g, ids] of groups) {
    html += `<optgroup label="${H[g]}">` + ids.map(id => `<option value="${id}">${roleName(id)}</option>`).join('') + '</optgroup>';
  }
  $('f-role').innerHTML = html;
  $('f-role').value = state.role;
}

// ---------- filters ----------
const parseMoney = s => {
  if (!s) return null;
  s = s.trim().toUpperCase().replace(',', '.');
  const m = s.match(/^([\d.]+)\s*(K|MLD|M|B)?/);   // MLD vóór M, anders "matcht" M al op de M van MLD
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] === 'K') v *= 1e3; else if (m[2] === 'M') v *= 1e6; else if (m[2] === 'MLD' || m[2] === 'B') v *= 1e9;
  v /= CUR_RATE[state.cur] || 1;   // invoer in gekozen valuta → intern GBP
  return isNaN(v) ? null : v;
};
// Contractdatums clusteren op een handvol unieke waarden (30-06, 31-12 per jaar), dus een
// klein Map'je vervangt honderdduizenden Date-allocaties per filterslag. "Nu" is per dump
// constant (state._nowTs, gewist in loadDump).
const _expTsCache = new Map();
function monthsUntil(expires) {
  if (!expires) return null;
  let ts = _expTsCache.get(expires);
  if (ts === undefined) { ts = +new Date(expires); _expTsCache.set(expires, ts); }
  if (isNaN(ts)) return null;
  return (ts - (state._nowTs ??= +gameNow())) / (1000 * 60 * 60 * 24 * 30.44);
}

function applyFilters() {
  if (state.mode === 'club-list') { renderClubList(); $('chipbar').innerHTML = ''; return; }
  let rows = state.mode === 'staff' ? state.staff : state.players;
  const name = $('f-name').value.trim().toLowerCase();
  const ageMin = +$('f-age-min').value || 0, ageMax = +$('f-age-max').value || 99;
  const caMin = +$('f-ca-min').value || 0, caMax = +$('f-ca-max').value || 999;
  const paMin = +$('f-pa-min').value || 0, paMax = +$('f-pa-max').value || 999;
  const metaMin = +$('f-meta-min').value || 0, metaMax = +$('f-meta-max').value || 99;
  const mpMin = +$('f-metapa-min').value || 0, mpMax = +$('f-metapa-max').value || 99;
  // Meta-score bestaat alleen voor spelers met attributen (staf en keepers vallen erbuiten).
  const wantMeta = state.mode !== 'staff' && (metaMin > 0 || metaMax < 99);
  const wantMetaPa = state.mode !== 'staff' && !state.hideCapa && (mpMin > 0 || mpMax < 99);
  const price = parseMoney($('f-price').value);
  const fee = parseMoney($('f-fee').value);
  // Max. loon-invoer volgt de gekozen weergaveperiode; intern vergelijken we per week.
  const wageIn = parseMoney($('f-wage').value);
  const wage = wageIn == null ? null : wageIn / wageFactor();
  const nat = $('f-nat').value.trim().toLowerCase();
  // Ontwikkeling: alleen actief met historie én zichtbare CA (groei is CA-afgeleid).
  const devOn = histReady() && !state.hideCapa && state.mode !== 'staff';
  const gMinRaw = $('f-growth-min').value, gMaxRaw = $('f-growth-max').value;
  const gMin = devOn && gMinRaw !== '' ? +gMinRaw : null;
  const gMax = devOn && gMaxRaw !== '' ? +gMaxRaw : null;
  const onlyNew = devOn && $('f-new').checked;
  const hMin = +$('f-height-min').value || 0, hMax = +$('f-height-max').value || 999;
  const footF = $('f-foot').value;
  // Wonderkids: staf heeft geen PA-groei, en zonder zichtbare PA is het filter verstopt.
  const onlyWk = state.mode !== 'staff' && !state.hideCapa && $('f-wonderkid').checked;
  const onlyEu = $('f-eu').checked, onlyMyClub = $('f-myclub').checked;
  const minInterest = +$('f-interest').value || 0;
  const tstatus = $('f-tstatus').value, contractF = $('f-contract').value;
  const onlySl = state.mode !== 'staff' && ($('f-shortlist').checked || state.mode === 'shortlist');
  const advRules = activeAdvRules();
  const staffRole = $('f-staffrole').value;
  const onlyRecruitableStaff = state.mode === 'staff' && $('f-staff-recruitable').checked;
  const gsel = $('f-gender').value;   // '' = beide, 'm' = mannen, 'v' = vrouwen
  const divVal = $('f-div').value.trim().toLowerCase();   // zoekbalk: substring, hoofdletterongevoelig
  const myClub = (state.meta.myClub || '').toLowerCase();
  if (state.mode === 'shortlist') rows = state.players;

  state.filtered = rows.filter(p => {
    if (!p.name || !p.name.trim() || p.name.trim() === '?') return false;   // naamloze stubs verbergen
      if (onlySl && !state.shortlist.has(p.id)) return false;
    // Zoek-haystack per speler cachen: 2 toLowerCase-allocaties per rij per toetsaanslag
    // wordt één .includes op een vaste string. Een NUL-teken (\u0000) als scheiding kan nooit in de
    // zoekterm zitten, dus de matchsemantiek (naam óf club bevat de term) is identiek.
    if (name && !(p._q ??= ((p.name || '') + '\u0000' + (p.club || '')).toLowerCase()).includes(name)) return false;
    const age = getAge(p);
    if (age < ageMin || age > ageMax) return false;
    if ((p.ca ?? 0) < caMin || (p.ca ?? 0) > caMax) return false;
    if ((p.pa ?? 0) < paMin || (p.pa ?? 0) > paMax) return false;
    if (wantMeta) { const s = metaScore(p); if (s == null || s < metaMin || s > metaMax) return false; }
    if (wantMetaPa) { const s = metaPaScore(p); if (s == null || s < mpMin || s > mpMax) return false; }
    if (price != null && (estValue(p).v ?? Infinity) > price) return false;
    if (fee != null && (feeEstimate(p).v ?? Infinity) > fee) return false;
    if (wage != null && (p.wage ?? Infinity) > wage) return false;
    if (nat && !((p.nat || []).some(n => n.toLowerCase().includes(nat) || natLabel(n).toLowerCase().includes(nat))
      || natsLabel(p).toLowerCase().includes(nat))) return false;
    if (onlyWk && !isWonderkid(p)) return false;
    if (onlyNew && !isNewSince(p)) return false;
    // Onbekende groei (nieuw, of te dunne basislijn) valt buiten een ingestelde grens,
    // net als bij lengte: anders zou "groei ≥ 10" vol nieuwe spelers staan.
    if (gMin != null || gMax != null) {
      const g = caGrowth(p);
      if (g == null || (gMin != null && g < gMin) || (gMax != null && g > gMax)) return false;
    }
    // Lengte/voet: onbekend valt buiten een ingesteld filter, net als bij de attribuutregels.
    if (hMin > 0 || hMax < 999) { const h = p.height || 0; if (h < hMin || h > hMax) return false; }
    if (footF && p.foot !== footF) return false;
    if (onlyEu && !isEu(p)) return false;
    // "Mijn club": toon eigen spelers + verhuurde (moederclub = mijn club, spelen elders)
    // + gehuurde (spelen bij mij, moederclub elders). Zie loanStatus() voor de kleuring.
    if (onlyMyClub) {
      const myClubId = Number(state.meta.myClubId) || 0;
      const playerClubId = Number(p.clubId) || 0, ownerClubId = Number(p.ownerClubId) || 0;
      if (myClubId && (playerClubId || ownerClubId)) {
        if (playerClubId !== myClubId && ownerClubId !== myClubId) return false;
      } else {
        const cl = (p.club || '').toLowerCase(), ow = (p.ownerClub || '').toLowerCase();
        if (cl !== myClub && ow !== myClub) return false;
      }
    }
    // Teamchips (1e/2e/jeugd) — alleen actief samen met "Mijn club" en teamType-data (plugin v0.1.10+).
    if (onlyMyClub && state.myTeam !== 'all' && state.mode !== 'staff') {
      const tt = p.teamType;
      const myClubId = Number(state.meta.myClubId) || 0;
      const playerClubId = Number(p.clubId) || 0;
      if (myClubId && playerClubId && playerClubId !== myClubId) return false;
      if (teamGroup(tt) !== state.myTeam) return false;
    }
    if (contractF === 'free' && !isFree(p)) return false;
    if (contractF === 'exp6' || contractF === 'exp12') {
      const m = monthsUntil(p.expires);
      if (m == null || m > (contractF === 'exp6' ? 6 : 12)) return false;
    }
    if (minInterest > 0) { const i = interestEstimate(p); if (!i || i.score < minInterest) return false; }
    // Transferstatus: te koop (transferlijst), te huur (huurlijst, plugin v0.1.36+) of allebei goed.
    if (tstatus === 'sale' && !p.listed) return false;
    if (tstatus === 'loan' && !p.loanListed) return false;
    if (tstatus === 'any' && !p.listed && !p.loanListed) return false;
    for (const r of advRules) {
      const av = advValue(p, r.k);
      if (av == null || av <= 0) return false;   // onbekend attribuut telt als geen match
      if (r.min && av < r.min) return false;
      if (r.max && av > r.max) return false;
    }
    if (activePos.size) {
      const prof = p.posProficiency;
      const hasProfData = prof && Object.keys(prof).length > 0;
      const pass = hasProfData
        ? [...activePos].some(pos => (prof[pos] ?? 0) >= state.profThreshold)
        : (p.posArr || []).some(x => activePos.has(x));   // old dump fallback
      if (!pass) return false;
    }
    if (state.mode === 'staff' && staffRole && staffRoleKey(p) !== staffRole) return false;
    if (onlyRecruitableStaff && !isRecruitableStaff(p)) return false;
    if (gsel === 'm' && p.gender === 1) return false;
    if (gsel === 'v' && p.gender !== 1) return false;
    if (divVal && !playerDivisionLabel(p).toLowerCase().includes(divVal)) return false;
    return true;
  });
  sortRows();
  renderChips(buildChips());
  updateSecDots();
  persistFilterTab();
  // Alleen de rijen; de kolomkoppen hangen niet van filters af. Aanroepers die de
  // kolomset wél veranderen (modus, taal, verborgen stats, nieuwe dump) doen zelf
  // renderTable() — een volledige headerrebuild + hermeting per toetsaanslag was zonde.
  renderVisible();
}

// Stip op de sectiekop zodra er binnen die sectie een filter actief is; zo zie je ook
// bij ingeklapte secties waar je moet zijn.
function updateSecDots() {
  const val = id => { const e = $(id); return e ? e.value.trim() : ''; };
  const on = {
    position: activePos.size > 0,
    role: !!$('f-role').value,
    staffrole: !!$('f-staffrole').value || (state.mode === 'staff' && $('f-staff-recruitable').checked),
    quality: ['f-age-min', 'f-age-max', 'f-ca-min', 'f-ca-max', 'f-pa-min', 'f-pa-max', 'f-meta-min', 'f-meta-max', 'f-metapa-min', 'f-metapa-max'].some(id => val(id))
      || activeAdvRules().length > 0 || (!state.hideCapa && $('f-wonderkid').checked),
    development: histReady() && !state.hideCapa
      && (['f-growth-min', 'f-growth-max'].some(id => val(id)) || $('f-new').checked),
    physical: ['f-height-min', 'f-height-max'].some(id => val(id)) || !!$('f-foot').value,
    financial: state.mode === 'staff' ? !!val('f-wage') : ['f-price', 'f-fee', 'f-wage'].some(id => val(id)),
    origin: !!(val('f-nat') || $('f-eu').checked || val('f-div')),
    availability: (state.mode !== 'staff' && (+$('f-interest').value > 0 || !!$('f-tstatus').value || $('f-shortlist').checked)) || !!$('f-contract').value || $('f-myclub').checked,
  };
  document.querySelectorAll('.fsection[data-sec]').forEach(sec => {
    const k = sec.dataset.sec;
    if (k in on) sec.classList.toggle('f-on', !!on[k]);
  });
}

// ---------- actieve filters als chips boven de tabel ----------
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function buildChips() {
  const chips = [];
  const add = (label, clear) => chips.push({ label, clear });
  const clearInput = id => () => { $(id).value = ''; };
  const uncheck = id => () => {
    $(id).checked = false;
    if (id === 'f-myclub' && state.mode === 'myplayer') setMode('players');
  };
  const range = (minId, maxId, label) => {
    const lo = $(minId).value, hi = $(maxId).value;
    if (lo || hi) add(`${label} ${lo || '…'}–${hi || '…'}`, () => { $(minId).value = ''; $(maxId).value = ''; });
  };
  const v = id => $(id).value.trim();

  if (v('f-name')) add(`${t('chipSearch')}: "${v('f-name')}"`, clearInput('f-name'));
  if (activePos.size) add(`${t('position')}: ${[...activePos].join(', ')}`,
    () => { activePos.clear(); document.querySelectorAll('.pos-node').forEach(n => n.classList.remove('on')); });
  if (state.mode === 'staff' && $('f-staffrole').value) add($('f-staffrole').value, () => { $('f-staffrole').value = ''; });
  if ($('f-gender').value) add(t($('f-gender').value === 'm' ? 'dbMen' : 'dbWomen'), () => { $('f-gender').value = ''; });
  if ($('f-div').value.trim()) add(`${t('divLabel')}: ${$('f-div').value.trim()}`, () => { $('f-div').value = ''; });
  range('f-age-min', 'f-age-max', t('age'));
  range('f-ca-min', 'f-ca-max', 'CA');
  range('f-pa-min', 'f-pa-max', 'PA');
  range('f-meta-min', 'f-meta-max', t('c_meta'));
  range('f-metapa-min', 'f-metapa-max', t('c_metapa'));
  if (!state.hideCapa && $('f-wonderkid').checked) add(t('wonderkidOnly'), uncheck('f-wonderkid'));
  if (histReady() && !state.hideCapa) {
    if ($('f-new').checked) add(t('onlyNew'), uncheck('f-new'));
    range('f-growth-min', 'f-growth-max', t('growthRange'));
  }
  range('f-height-min', 'f-height-max', t('heightCm'));
  if ($('f-foot').value) add(`${t('foot')}: ${$('f-foot').selectedOptions[0].textContent}`, () => { $('f-foot').value = ''; });
  if (v('f-price')) add(`${t('maxvalue')} ${v('f-price')}`, clearInput('f-price'));
  if (v('f-fee')) add(`${t('maxfee')} ${v('f-fee')}`, clearInput('f-fee'));
  if (v('f-wage')) add(`${t('maxwage')} ${v('f-wage')}`, clearInput('f-wage'));
  if (v('f-nat')) add(`${t('nat')}: ${v('f-nat')}`, clearInput('f-nat'));
  if ($('f-eu').checked) add(t('euonly'), uncheck('f-eu'));
  if (+$('f-interest').value > 0) add(`${t('interestmin')} ${$('f-interest').selectedOptions[0].textContent}`, () => { $('f-interest').value = '0'; });
  if ($('f-tstatus').value) add(`${t('tstatus')}: ${$('f-tstatus').selectedOptions[0].textContent}`, () => { $('f-tstatus').value = ''; });
  if ($('f-contract').value) add(`${t('contractF')}: ${$('f-contract').selectedOptions[0].textContent}`, () => { $('f-contract').value = ''; });
  for (const r of activeAdvRules()) add(advChipTxt(r), () => {
    if (state.mode === 'staff') state.advStaffF = state.advStaffF.filter(x => x !== r);
    else state.advF = state.advF.filter(x => x !== r);
    saveAdv();
  });
  if ($('f-myclub').checked) add(t('myclub'), uncheck('f-myclub'));
  if (state.mode === 'staff' && $('f-staff-recruitable').checked)
    add(t('staffRecruitableOnly'), () => { $('f-staff-recruitable').checked = false; });
  if ($('f-shortlist').checked && state.mode !== 'shortlist' && state.mode !== 'staff') add(t('onlyshortlist'), uncheck('f-shortlist'));
  return chips;
}
function renderChips(chips) {
  const bar = $('chipbar');
  const n = state.filtered.length.toLocaleString();
  bar.innerHTML = `<span class="chip-count"><b>${n}</b> ${t('results')}</span>` +
    chips.map((c, i) => `<button class="chip" data-i="${i}" title="${t('clear')}">${escHtml(c.label)}<span class="x">${icon('x', 10)}</span></button>`).join('') +
    (chips.length > 1 ? `<button class="chip-clear">${t('clearAll')}</button>` : '');
  bar.querySelectorAll('.chip').forEach(el => el.onclick = () => { chips[+el.dataset.i].clear(); applyFilters(); });
  const ca = bar.querySelector('.chip-clear');
  if (ca) ca.onclick = () => $('btn-clear').onclick();
}
// ---------- opgeslagen filterpresets ----------
// Een preset is een momentopname van alle filtervelden (tekst, vinkjes, selects, posities
// op het veld en de gekozen tactische rol). Bewaard in localStorage; zelfde naam = overschrijven.
const PRESET_TEXT_IDS = ['f-name', 'f-age-min', 'f-age-max', 'f-ca-min', 'f-ca-max', 'f-pa-min', 'f-pa-max', 'f-meta-min', 'f-meta-max', 'f-metapa-min', 'f-metapa-max', 'f-growth-min', 'f-growth-max', 'f-height-min', 'f-height-max', 'f-price', 'f-fee', 'f-wage', 'f-nat', 'f-div'];
const PRESET_CHECK_IDS = ['f-eu', 'f-myclub', 'f-shortlist', 'f-wonderkid', 'f-new'];
// De peilperiode hoort bewust bij de preset: "doorbraken dit seizoen" betekent niets als
// het venster erbij wegvalt. Zie applyPreset voor het opnieuw ophalen van de groeidata.
const PRESET_SELECT_IDS = ['f-interest', 'f-staffrole', 'f-role', 'f-contract', 'f-tstatus', 'f-foot', 'f-hist-period', 'f-gender'];
function loadPresets() { try { return JSON.parse(localStorage.getItem('fmss_presets') || '[]'); } catch { return []; } }
function storePresets(list) { localStorage.setItem('fmss_presets', JSON.stringify(list)); }
function snapshotFilters() {
  const s = { text: {}, check: {}, select: {}, pos: [...activePos] };
  for (const id of PRESET_TEXT_IDS) { const v = $(id).value.trim(); if (v) s.text[id] = v; }
  for (const id of PRESET_CHECK_IDS) if ($(id).checked) s.check[id] = true;
  if (!$('f-staff-recruitable').checked) s.check['f-staff-recruitable'] = false;
  for (const id of PRESET_SELECT_IDS) { const v = $(id).value; if (v && v !== '0') s.select[id] = v; }
  const adv = state.advF.filter(r => r.k && (r.min || r.max));
  if (adv.length) s.adv = adv.map(r => ({ ...r }));
  const advStaff = (state.advStaffF || []).filter(r => r.k && (r.min || r.max));
  if (advStaff.length) s.advStaff = advStaff.map(r => ({ ...r }));
  return s;
}
// f-hist-period heeft altijd een waarde (standaard 'y1') en telt dus niet als "actief
// filter" — anders was de lege-preset-waarschuwing onbereikbaar en sleepte elke preset
// stilletjes een groeiperiode mee die de gebruiker nooit aanraakte.
const presetIsEmpty = s => !s.pos.length && !Object.keys(s.text).length && !Object.keys(s.check).length
  && !Object.keys(s.select).some(k => k !== 'f-hist-period') && !(s.adv || []).length && !(s.advStaff || []).length;
function applyPreset(s) {
  $('btn-clear').onclick();                       // schone lei
  $('f-role').value = '';                         // rol hoort bij de preset, niet bij de vorige zoektocht
  for (const [id, v] of Object.entries(s.text || {})) if ($(id)) $(id).value = v;
  for (const [id, value] of Object.entries(s.check || {})) if ($(id)) $(id).checked = value !== false;
  if (s.select?.['f-staffrole']) {
    const oldRole = state.staff.find(p => p.job === s.select['f-staffrole']);
    if (oldRole) s.select['f-staffrole'] = staffRoleKey(oldRole);
  }
  for (const [id, v] of Object.entries(s.select || {})) if ($(id)) $(id).value = v;
  // Oude presets (vóór de contractstatus-select) sloegen dit op als losse checkboxes.
  const oc = s.check || {};
  if (oc['f-free']) $('f-contract').value = 'free';
  else if (oc['f-exp6']) $('f-contract').value = 'exp6';
  else if (oc['f-exp12']) $('f-contract').value = 'exp12';
  // Idem vóór de transferstatus-select (v1.2): transferlijst-checkbox → "te koop".
  if (oc['f-listed']) $('f-tstatus').value = 'sale';
  state.advF = (s.adv || []).map(r => ({ ...r }));
  state.advStaffF = (s.advStaff || []).map(r => ({ ...r }));
  saveAdv();
  const codes = new Set(s.pos || []);
  activePos.clear();
  document.querySelectorAll('.pos-node').forEach(n => {
    const on = codes.has(n.dataset.pos);
    n.classList.toggle('on', on);
    if (on) activePos.add(n.dataset.pos);
  });
  // rol-keuze gedraagt zich zoals de gewone rol-selectie (incl. sorteren op rolscore)
  state.role = $('f-role').value;
  localStorage.setItem('fmss_role', state.role);
  if (state.role) { state.sortKey = 'role'; state.sortDir = -1; }
  else if (state.sortKey === 'role') { state.sortKey = 'ca'; state.sortDir = -1; }
  // Andere peilperiode = andere groeidata, dus eerst ophalen en dán filteren.
  const per = (s.select || {})['f-hist-period'];
  if (per && HIST_PERIODS.includes(per) && per !== state.histPeriod && histReady()) {
    setHistPeriod(per).then(applyFilters);
    return;
  }
  applyFilters();
}
// Klein in-app dialoogje in de stijl van de app (geen system-popups zoals prompt/confirm).
// opts: { title, body?, input? (placeholder → toont invoerveld), confirmLabel, danger?, onConfirm(value) }
function presetDialog(opts) {
  const m = $('preset-modal');
  m.innerHTML = `<div class="pm-card">
    <div class="pm-title">${opts.title}</div>
    ${opts.body ? `<div class="pm-body">${opts.body}</div>` : ''}
    ${opts.input != null ? `<input type="text" id="pm-input" maxlength="40" placeholder="${opts.input}">` : ''}
    <div class="pm-actions">
      <button class="pm-cancel">${t('cancelBtn')}</button>
      <button class="pm-ok${opts.danger ? ' danger' : ''}">${opts.confirmLabel}</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { m.classList.add('hidden'); document.removeEventListener('keydown', esc, true); };
  const ok = () => {
    const inp = $('pm-input');
    const v = inp ? inp.value.trim() : null;
    if (inp && !v) { inp.focus(); return; }   // lege naam: blijf staan
    close();
    opts.onConfirm(v);
  };
  document.addEventListener('keydown', esc, true);   // capture: vóór de globale Esc-handlers
  m.querySelector('.pm-cancel').onclick = close;
  m.querySelector('.pm-ok').onclick = ok;
  m.onclick = e => { if (e.target === m) close(); };
  const inp = $('pm-input');
  if (inp) { inp.focus(); inp.onkeydown = e => { if (e.key === 'Enter') ok(); }; }
}
// Dropdown: knop toont de laatst toegepaste preset; het menu eronder heeft per preset
// een kruisje om te verwijderen (met bevestiging). state.presetSel is alleen een label,
// de chips boven de tabel blijven de bron van waarheid voor wat er actief is.
function closePresetMenu() {
  $('preset-dd-menu').classList.add('hidden');
  $('preset-dd-btn').classList.remove('open');
}
function renderPresets() {
  const btn = $('preset-dd-btn'), menu = $('preset-dd-menu'), label = $('preset-dd-label');
  const list = loadPresets();
  const has = list.length > 0;
  btn.disabled = !has;
  if (!has) { state.presetSel = null; closePresetMenu(); }
  label.textContent = has ? (state.presetSel || t('presetPick')) : t('presetNone');
  menu.innerHTML = list.map((p, i) =>
    `<div class="pd-item" data-i="${i}"><span class="pd-name">${escHtml(p.name)}</span><button class="pd-del" data-del="${i}" title="${t('deleteBtn')}">${icon('x', 11)}</button></div>`).join('');
  menu.querySelectorAll('.pd-item').forEach(el => el.onclick = e => {
    if (e.target.closest('.pd-del')) return;   // kruisje heeft z'n eigen handler
    const p = loadPresets()[+el.dataset.i];
    closePresetMenu();
    if (p) {
      applyPreset(p.state);                    // wist eerst alles (reset ook presetSel)
      state.presetSel = p.name;
      label.textContent = p.name;
      showToast(p.name, 'search');
    }
  });
  menu.querySelectorAll('.pd-del').forEach(x => x.onclick = e => {
    e.stopPropagation();
    const p = loadPresets()[+x.dataset.del];
    if (!p) return;
    presetDialog({
      title: t('presetDelTitle'),
      body: tf('presetDelConfirm', { name: escHtml(p.name) }),
      confirmLabel: t('deleteBtn'),
      danger: true,
      onConfirm: () => {
        const cur = loadPresets();
        const idx = cur.findIndex(q => q.name === p.name);
        if (idx >= 0) { cur.splice(idx, 1); storePresets(cur); }
        if (state.presetSel === p.name) state.presetSel = null;
        renderPresets();
      },
    });
  });
}
$('preset-dd-btn').onclick = e => {
  e.stopPropagation();
  const m = $('preset-dd-menu');
  m.classList.toggle('hidden');
  $('preset-dd-btn').classList.toggle('open', !m.classList.contains('hidden'));
};
document.addEventListener('click', e => { if (!e.target.closest('#preset-dd')) closePresetMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePresetMenu(); });
$('btn-preset-save').onclick = () => {
  const snap = snapshotFilters();
  if (presetIsEmpty(snap)) { showToast(t('presetEmptyFilters')); return; }
  presetDialog({
    title: t('presetSaveTitle'),
    input: t('presetNamePrompt'),
    confirmLabel: t('saveBtn'),
    onConfirm: name => {
      const list = loadPresets().filter(p => p.name !== name);   // zelfde naam = overschrijven
      list.push({ name, state: snap });
      storePresets(list);
      state.presetSel = name;
      renderPresets();
      showToast(t('presetSaved'), 'check');
    },
  });
};

// ---------- kolomconfiguratie (volgorde + verbergen, per modus) ----------
const modeKey = () => state.mode === 'staff' ? 'staff' : 'players';
function baseCols() { return modeKey() === 'staff' ? STAFF_COLS : PLAYER_COLS; }
function colCfg() {
  const k = modeKey();
  const cols = baseCols().filter(c => !c.star);
  const keys = cols.map(c => c.key);
  const defHidden = new Set(cols.filter(c => c.defHidden).map(c => c.key));
  let saved = state.colCfg[k];
  if (!saved || !Array.isArray(saved.order)) { saved = { order: [...keys], hidden: [...defHidden] }; state.colCfg[k] = saved; }
  if (k === 'staff') {
    const training = STAFF_TRAINING_CATEGORIES.map(category => category.key);
    const nonTraining = keys.filter(key => !training.includes(key));
    const previousDefault = [...nonTraining.slice(0, 3), ...training, ...nonTraining.slice(3)];
    if (saved.order.length === previousDefault.length && saved.order.every((key, i) => key === previousDefault[i])) {
      saved.order = [...keys];
      saveColCfg();
    }
  }
  for (const kk of keys) if (!saved.order.includes(kk)) {   // nieuwe kolommen erbij
    // op de standaardplek invoegen (na de dichtstbijzijnde bekende voorganger), niet achteraan
    const prev = keys.slice(0, keys.indexOf(kk)).reverse().find(k2 => saved.order.includes(k2));
    saved.order.splice(prev ? saved.order.indexOf(prev) + 1 : saved.order.length, 0, kk);
    if (defHidden.has(kk) && !saved.hidden.includes(kk)) saved.hidden.push(kk);   // standaard verborgen
  }
  saved.order = saved.order.filter(kk => keys.includes(kk));                    // verdwenen eruit
  return saved;
}
function saveColCfg() { localStorage.setItem('fmss_cols', JSON.stringify(state.colCfg)); }
// Kolom voor de gekozen tactische rol (verschijnt alleen als er een rol geselecteerd is).
function roleCol() {
  const r = ROLE_BY_ID[state.role];
  if (!r) return null;
  return {
    key: 'role', label: 'roleColHdr', num: true,
    get: p => { const s = roleScore(p, r); return s == null ? -1 : s; },
    render: p => { const s = roleScore(p, r); return s == null ? '<span class="dim">·</span>' : `<span class="${roleClass(s)}">${s.toFixed(1)}</span>`; },
  };
}
function activeCols() {
  const base = baseCols();
  const byKey = Object.fromEntries(base.map(c => [c.key, c]));
  const cf = colCfg();
  const hidden = new Set(cf.hidden);
  const sl = base.find(c => c.star);                     // ster-kolom altijd vooraan
  const name = base.find(c => c.name);
  const rc = state.mode !== 'staff' ? roleCol() : null;  // rol-kolom direct na naam
  const rest = cf.order.filter(k => !hidden.has(k) && byKey[k] && !(rc && k === 'role') && !hiddenStatCol(k)).map(k => byKey[k]);
  const out = [];
  if (sl) out.push(sl);
  for (const c of rest) { out.push(c); if (rc && c === name) out.push(rc); }
  if (rc && !name) out.splice(1, 0, rc);
  return out;
}
function reorderCol(fromKey, toKey) {
  if (fromKey === toKey) return;
  const cf = colCfg();
  const arr = cf.order;
  const fi = arr.indexOf(fromKey), ti = arr.indexOf(toKey);
  if (fi < 0 || ti < 0) return;
  arr.splice(fi, 1);
  arr.splice(arr.indexOf(toKey), 0, fromKey);            // vóór de doelkolom plaatsen
  saveColCfg(); renderTable();
}
function sortRows() {
  const col = activeCols().find(c => c.key === state.sortKey) || activeCols()[1];
  if (col.star) return;
  const dir = state.sortDir;
  // Sorteersleutel één keer per rij berekenen i.p.v. per vergelijking (n i.p.v. n·log n):
  // scheelt bij berekende kolommen (meta, waardeschatting) en mega-dumps een orde van
  // grootte. Strings via één hergebruikte Collator (veel sneller dan losse localeCompare).
  const rows = state.filtered;
  const keys = rows.map(col.get);
  const idx = rows.map((_, i) => i);
  const coll = new Intl.Collator(state.lang);
  idx.sort((ia, ib) => {
    const va = keys[ia], vb = keys[ib];
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;
    if (typeof va === 'number') return (va - vb) * dir;
    return coll.compare(va, vb) * dir;
  });
  state.filtered = idx.map(i => rows[i]);
}

// ---------- gevirtualiseerde tabel ----------
let ROW_H = 28;              // wordt na de eerste render gemeten (zoom/DPI-onafhankelijk)
let renderQueued = false;
let resizing = false;        // true tijdens/vlak na kolombreedte slepen (onderdrukt sorteer-klik)
// Meet de echte rijhoogte zodat spacer + translateY exact kloppen (voorkomt drift/verdwijnende lijnen).
function measureRowH() {
  const tr = $('grid-body').querySelector('tr[data-i]');
  if (!tr) return false;
  const h = tr.getBoundingClientRect().height;
  if (h > 12 && Math.abs(h - ROW_H) > 0.02) {
    ROW_H = h;
    return true;
  }
  return false;
}
function colLabel(c) {
  if (c.star) return starSvg(13);
  const base = c.label.startsWith('c_') || I18N.nl[c.label] ? t(c.label) : c.label;
  return c.key === 'wage' ? base + ' ' + wageSuf() : base;   // salarisperiode in de kop
}
function colWidths() { return state.colW[modeKey()] || (state.colW[modeKey()] = {}); }
function saveColW() { localStorage.setItem('fmss_colw', JSON.stringify(state.colW)); }
function renderTable() {
  const cols = activeCols();
  const W = colWidths();
  // Vaste lay-out: elke kolom krijgt altijd een breedte (gebruikers-breedte wint van de
  // standaard) en de tabel de som — anders bepalen de zichtbare rijen de breedtes en
  // verspringt alles bij sorteren/scrollen.
  const wOf = c => W[c.key] || c.w || 90;
  $('grid').style.width = cols.reduce((s, c) => s + wOf(c), 0) + 'px';
  $('grid-head').innerHTML = cols.map(c => {
    const stick = c.star ? 'c-sticky' : c.name ? 'c-sticky stick-end' : '';
    const w = ` style="width:${wOf(c)}px"`;
    const grip = c.star ? '' : '<span class="col-resize"></span>';   // sleepgreep rechts
    const help = c.help ? `<span class="col-help" data-help="${c.help}">?</span>` : '';
    return `<th data-key="${c.key}" draggable="${c.star ? 'false' : 'true'}"${w} class="${stick} ${c.key === state.sortKey ? 'sorted' : ''}">${colLabel(c)}${help}${c.key === state.sortKey ? (state.sortDir < 0 ? ' ▼' : ' ▲') : ''}${grip}</th>`;
  }).join('');
  $('grid-head').querySelectorAll('th').forEach(th => {
    const k = th.dataset.key;
    // kolombreedte slepen via de greep rechts
    const grip = th.querySelector('.col-resize');
    if (grip) {
      grip.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        resizing = true;                                     // onderdruk de sorteer-klik hierna
        const startX = e.clientX, startW = th.getBoundingClientRect().width;
        const grid = $('grid'), startTW = parseFloat(grid.style.width) || grid.getBoundingClientRect().width;
        th.draggable = false;
        // Tabelbreedte beweegt mee, anders herverdeelt de vaste lay-out de andere kolommen.
        const move = ev => {
          const nw = Math.max(40, Math.round(startW + ev.clientX - startX));
          th.style.width = nw + 'px';
          grid.style.width = Math.round(startTW + (nw - startW)) + 'px';
          colWidths()[k] = nw;
        };
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); th.draggable = true; saveColW(); renderVisible(); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      });
      grip.addEventListener('click', e => { e.stopPropagation(); });   // greep-klik nooit sorteren
      grip.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
    }
    const col = cols.find(c => c.key === k);
    th.onclick = e => {
      if (col?.star) return;
      if (e.target.closest('.col-help')) return;             // ?-icoon is alleen uitleg, niet sorteren
      if (resizing) { resizing = false; return; }            // net een kolom versmald/verbreed: niet sorteren
      if (state.sortKey === k) state.sortDir *= -1;
      else { state.sortKey = k; state.sortDir = (k === 'pos' || k === 'name' || k === 'nat') ? 1 : -1; }
      sortRows(); renderTable();
    };
    if (col?.star) return;
    // slepen om te herordenen
    th.ondragstart = e => { e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move'; th.classList.add('dragging'); };
    th.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; th.classList.add('drop-target'); };
    th.ondragleave = () => th.classList.remove('drop-target');
    th.ondragend = () => $('grid-head').querySelectorAll('th').forEach(x => x.classList.remove('dragging', 'drop-target'));
    th.ondrop = e => { e.preventDefault(); th.classList.remove('drop-target'); reorderCol(e.dataTransfer.getData('text/plain'), k); };
  });
  renderVisible();
  if (measureRowH()) renderVisible();   // hermeet en herpositioneer met echte hoogte
}

// rechtsklik op de koppen → kolommen tonen/verbergen
$('grid-head').addEventListener('contextmenu', e => { e.preventDefault(); openColMenu(e.clientX, e.clientY); });

function openColMenu(x, y) {
  closeColMenu();
  const cf = colCfg();
  const hidden = new Set(cf.hidden);
  // Kolommen onder de verborgen-stats-toggle horen ook niet in dit menu als ze uit staan.
  const base = baseCols().filter(c => !c.star && !hiddenStatCol(c.key));
  const menu = document.createElement('div');
  menu.id = 'colmenu';
  menu.innerHTML = `<div class="cm-head">${t('colsTitle')}</div>` +
    base.map(c => `<label class="cm-row"><input type="checkbox" data-k="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${colLabel(c)}</label>`).join('') +
    `<button class="cm-reset">${t('colsReset')}</button>`;
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 340) + 'px';
  document.body.appendChild(menu);
  menu.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
    const k = cb.dataset.k;
    const h = new Set(colCfg().hidden);
    if (cb.checked) h.delete(k); else h.add(k);
    colCfg().hidden = [...h];
    saveColCfg(); renderTable();
  });
  menu.querySelector('.cm-reset').onclick = () => {
    state.colCfg[modeKey()] = { order: baseCols().filter(c => !c.star).map(c => c.key), hidden: [] };
    saveColCfg(); renderTable(); closeColMenu();
  };
}
function closeColMenu() { const m = $('colmenu'); if (m) m.remove(); }
document.addEventListener('click', e => { if (!e.target.closest('#colmenu')) closeColMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeColMenu(); });
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || !['players', 'shortlist', 'myplayer'].includes(state.mode) || !state.filtered.length) return;
  e.preventDefault();
  const selectable = state.filtered.filter(p => !p.job);
  selectable.forEach(p => state.bulkSelected.add(p.id));
  state.bulkAnchor = state.filtered.findIndex(p => !p.job);
  updateBulkBar(); renderVisible(); syncDetailToBulkSelection();
});
// Huurstatus voor de naamkleuring. Elke gehuurde speler (moederclub ≠ huidige club,
// bv. eigendom Man City maar spelend bij Nordsjælland) kleurt blauw (loan-in). Onder het
// "Mijn club"-filter geldt bovendien: eigen spelers die elders gestald zijn = rood (loan-out).
function loanStatus(p) {
  const cl = (p.club || '').toLowerCase(), ow = (p.ownerClub || '').toLowerCase();
  if (!ow || !cl || ow === cl) return '';
  if ($('f-myclub').checked) {
    const my = (state.meta.myClub || '').toLowerCase();
    if (my && ow === my && cl !== my) return 'loan-out';
  }
  return 'loan-in';
}
function renderVisible() {
  const wrap = $('table-wrap'), cols = activeCols();
  const total = state.filtered.length;
  const first = Math.max(0, Math.floor(wrap.scrollTop / ROW_H) - 10);
  const count = Math.ceil(wrap.clientHeight / ROW_H) + 20;
  const last = Math.min(total, first + count);
  const slice = state.filtered.slice(first, last);
  const body = $('grid-body');
  // Virtualisatie via spacer-rijen binnen de tbody: totale hoogte = exact total*ROW_H,
  // dus je kunt nooit voorbij de lijst scrollen (geen leeg veld bij korte lijsten).
  const ncol = cols.length;
  const topPad = first * ROW_H, botPad = (total - last) * ROW_H;
  const spacer = h => h > 0 ? `<tr class="vspacer"><td colspan="${ncol}" style="height:${h}px;padding:0;border:0"></td></tr>` : '';
  body.innerHTML = spacer(topPad) + slice.map((p, i) => {
    const idx = first + i;
    const tds = cols.map(c => {
      const stick = c.star ? 'c-sticky' : c.name ? 'c-sticky stick-end' : '';
      if (c.star) {
        const on = state.shortlist.has(p.id);
        return `<td class="star-cell ${stick} ${on ? 'on' : ''}" data-star="${p.id}">${starSvg(15)}</td>`;
      }
      if (c.render) return `<td class="${c.num ? 'num' : ''}">${c.render(p)}</td>`;
      let v = c.get(p);
      if (c.name) {
        const ls = loanStatus(p);
        const lt = ls === 'loan-out' ? ` · ${tf('loanOut', { c: p.club || '?' })}`
          : ls === 'loan-in' ? ` · ${tf('loanIn', { c: p.ownerClub || '?' })}` : '';
        return `<td class="pname ${ls} ${stick}" data-tip="${escHtml(t('copyNameTip') + lt)}">${v ? escHtml(v) : '?'}</td>`;
      }
      if (c.dimNull && !v) return `<td class="dim">–</td>`;
      if (c.fmt) v = c.fmt(v);
      if (v == null || v === '') v = '–';
      // v is hier altijd platte tekst (kolommen met HTML gebruiken render) en kan uit
      // game-data komen (nationaliteit, staf-rol) → escapen, custom databases kunnen alles bevatten.
      return `<td class="${c.num ? 'num' : ''} ${c.cls || ''} ${c.tdCls ? c.tdCls(p) : ''}">${escHtml(String(v))}</td>`;
    }).join('');
    const rowClasses = `${state.selected === p ? 'sel ' : ''}${state.bulkSelected.has(p.id) ? 'bulk-sel ' : ''}${idx % 2 ? 'even' : ''}`.trim();
    return `<tr data-i="${idx}" class="${rowClasses}" style="height:${ROW_H}px">${tds}</tr>`;
  }).join('') + spacer(botPad);
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    tr.onclick = e => {
      const star = e.target.closest('[data-star]');
      if (star) { toggleShortlist(+star.dataset.star); e.stopPropagation(); return; }
      const p = state.filtered[+tr.dataset.i];
      // Clicking the name copies it and still follows the normal row-selection flow.
      if (e.target.closest('.pname')) copyName(p.name);
      if (state.mode !== 'staff' && !p.job && (state.mode === 'players' || state.mode === 'shortlist' || state.mode === 'myplayer')) {
        const at = +tr.dataset.i;
        if (e.shiftKey && state.bulkAnchor != null) {
          // Shift extends from the anchor, replacing the previous range unless
          // Ctrl/Cmd is also held (Excel-style additive range selection).
          if (!(e.ctrlKey || e.metaKey)) state.bulkSelected.clear();
          const lo = Math.min(state.bulkAnchor, at), hi = Math.max(state.bulkAnchor, at);
          for (let j = lo; j <= hi; j++) if (!state.filtered[j].job) state.bulkSelected.add(state.filtered[j].id);
        } else if (e.ctrlKey || e.metaKey) {
          if (state.bulkSelected.has(p.id)) state.bulkSelected.delete(p.id);
          else state.bulkSelected.add(p.id);
          state.bulkAnchor = at;
        } else {
          // A plain click starts a new selection, just like a spreadsheet.
          state.bulkSelected.clear();
          state.bulkSelected.add(p.id);
          state.bulkAnchor = at;
        }
        updateBulkBar(); renderVisible(); syncDetailToBulkSelection(); e.stopPropagation(); return;
      }
      if (p.job && state.bulkSelected.size) {
        state.bulkSelected.clear(); state.bulkAnchor = null; updateBulkBar();
      }
      showDetail(p);
    };
  });
}
let lastScrollRow = -1;
$('table-wrap').addEventListener('scroll', () => {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // Horizontaal scrollen en verticale deltas binnen dezelfde rij verschuiven het
    // zichtbare rijvenster niet — dan is opnieuw renderen (50 rijen innerHTML +
    // handlers per frame) verspilling. Andere aanroepers van renderVisible (filters,
    // shortlist, valuta) blijven onvoorwaardelijk tekenen.
    const row = Math.floor($('table-wrap').scrollTop / ROW_H);
    if (row === lastScrollRow) return;
    lastScrollRow = row;
    renderVisible();
  });
});

// ---------- klembord / toast ----------
function showToast(msg, ico) {
  const el = $('toast');
  el.innerHTML = (ico ? icon(ico, 13) + ' ' : '') + escHtml(msg); el.className = 'show';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.className = 'hidden', 1600);
}
function copyName(name) {
  const ok = () => showToast(t('copied') + ': ' + name, 'clipboard');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(name).then(ok, () => fallbackCopy(name, ok));
  else fallbackCopy(name, ok);
}
function fallbackCopy(text, ok) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok();
  } catch { showToast('!'); }
}

// ---------- shortlist ----------
function toggleShortlist(id) {
  const playerIds = new Set((state.allPlayers || state.players).map(p => Number(p.id)));
  if (!playerIds.has(Number(id))) return;
  if (state.shortlist.has(id)) state.shortlist.delete(id); else state.shortlist.add(id);
  invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
  $('sl-count').textContent = state.shortlist.size;
  if (state.mode === 'shortlist' || $('f-shortlist').checked) applyFilters(); else renderVisible();
  const el = document.querySelector('.detail-star');
  if (el && state.selected) el.classList.toggle('on', state.shortlist.has(state.selected.id));
}
function exportShortlist() {
  const ids = state.shortlist;
  const all = state.players.filter(p => ids.has(p.id));
  if (!all.length) { showToast(t('slEmpty')); return; }
  const withCapa = !state.hideCapa;   // vraagprijs valt ook onder de verborgen-stats-toggle
  const cols = ['Name', 'Position', 'Age', 'Club', 'Nationality',
    ...(withCapa ? ['CA', 'PA'] : []), 'Value(GBP)', ...(withCapa ? ['AskingPrice(GBP)'] : []), 'Wage(GBP)', 'Contract', 'Interest'];
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const p of all) {
    const i = interestEstimate(p);
    lines.push([p.name, p.pos || jobLabel(p), getAge(p), p.club || '', natsLabel(p),
      ...(withCapa ? [p.ca, p.pa] : []), estValue(p).v ?? '', ...(withCapa ? [feeEstimate(p).v ?? ''] : []), p.wage ?? '', p.expires || '', i ? i.label : ''].map(esc).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // revoke pas ná de download (Firefox breekt hem anders af) — zelfde patroon als downloadPlayerCard
  a.download = 'fmscuperscout24-shortlist.csv';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast(tf('exportedCsv', { n: all.length }), 'check');
  coffeeGlow();
}
function updateBulkBar() {
  const bar = $('bulk-bar');
  const n = ['players', 'shortlist', 'myplayer'].includes(state.mode) ? state.bulkSelected.size : 0;
  bar.classList.toggle('hidden', n === 0);
  const removing = state.mode === 'shortlist';
  $('bulk-count').textContent = tf('bulkselected', { n });
  $('btn-bulk-add').textContent = t(removing ? 'bulkremove' : 'bulkadd');
  bar.classList.toggle('remove', removing);
}
function syncDetailToBulkSelection() {
  if (!['players', 'shortlist', 'myplayer'].includes(state.mode) || state.bulkSelected.size !== 1) {
    closeDetail();
    return;
  }
  const id = [...state.bulkSelected][0];
  const p = state.players.find(x => Number(x.id) === Number(id));
  if (p) showDetail(p); else closeDetail();
}
function addBulkToShortlist() {
  const removing = state.mode === 'shortlist';
  let changed = 0;
  for (const id of state.bulkSelected) {
    if (removing) {
      if (state.shortlist.delete(id)) changed++;
    } else if (!state.shortlist.has(id)) {
      state.shortlist.add(id); changed++;
    }
  }
  if (changed) invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
  $('sl-count').textContent = state.shortlist.size;
  state.bulkSelected.clear(); state.bulkAnchor = null; updateBulkBar();
  if (removing) applyFilters(); else renderVisible();
  syncDetailToBulkSelection();
  showToast(tf(removing ? 'bulkRemoved' : 'bulkAdded', { n: changed }), 'check');
}
function clearBulkSelection() {
  state.bulkSelected.clear(); state.bulkAnchor = null; updateBulkBar(); renderVisible(); syncDetailToBulkSelection();
}

async function exportShortlistFmf() {
  const knownPlayers = new Set(state.players.map(p => Number(p.id)));
  const ids = [...state.shortlist].map(Number).filter(id => knownPlayers.has(id));
  if (!ids.length) { showToast(t('slEmpty')); return; }
  if (typeof window.showSaveFilePicker !== 'function') {
    showToast(t('fmfSavePickerUnsupported'));
    return;
  }

  const suggested = `FMSuperScout 24 ${state.meta.gameDate || ''}`.trim()
    .replace(/[\\/:*?"<>|]/g, '_') + '.fmf';
  let fileHandle;
  try {
    // Edge remembers the most recently used folder for this picker id.
    fileHandle = await window.showSaveFilePicker({
      id: 'fmf-shortlist',
      suggestedName: suggested,
      types: [{ description: 'Football Manager shortlist', accept: { 'application/octet-stream': ['.fmf'] } }],
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    showToast(`${t('fmfExportError')}: ${e.message || e}`);
    return;
  }

  const name = fileHandle.name.replace(/\.fmf$/i, '') || 'FMSuperScout 24';
  try {
    const response = await fetch('/api/shortlist-fmf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ids }),
    });
    if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
    const blob = await response.blob();
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      await writable.abort().catch(() => {});
      throw e;
    }
    showToast(tf('fmfExported', { n: ids.length }), 'check');
    coffeeGlow();
  } catch (e) { showToast(`${t('fmfExportError')}: ${e.message || e}`); }
}

function clearShortlist() {
  if (!state.shortlist.size) return;
  if (!confirm(tf('clearShortConfirm', { n: state.shortlist.size }))) return;
  state.shortlist.clear();
  invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', '[]');
  $('sl-count').textContent = '0';
  $('shortlist-sync-status').textContent = '';
  applyFilters();
  showToast(t('shortlistCleared'), 'check');
}

async function importShortlistFmf(file) {
  if (!file) return;
  try {
    const response = await fetch('/api/shortlist-fmf/import', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    const ids = [...normalizeShortlistIds(result.ids)];
    restoreShortlistPlayers(ids);
    const known = new Set(state.players.map(p => Number(p.id)));
    const imported = ids.filter(id => known.has(id));
    const missing = ids.length - imported.length;
    if (imported.length === 0 && missing > 0) {
      const message = tf('fmfNoMatch', { n: missing });
      $('shortlist-sync-status').textContent = `${result.name}: ${message}`;
      showToast(message, 'warning');
      return;
    }
    state.shortlist = new Set(imported);
    localStorage.setItem('fmss_shortlist', JSON.stringify(imported));
    $('sl-count').textContent = state.shortlist.size;
    $('shortlist-sync-status').textContent = tf('fmfImported', { name: result.name, n: imported.length }) + (missing ? ` · ${tf('fmfMissing', { n: missing })}` : '');
    applyFilters();
    showToast(tf('fmfImported', { name: result.name, n: imported.length }), 'check');
  } catch (e) { showToast(`${t('fmfImportError')}: ${e.message || e}`); }
  finally { $('input-import-fmf').value = ''; }
}

// ---------- detailpaneel ----------
// FM-attribuutkleuren: 16-20 groen, 11-15 oranje, 1-10 witachtig. Ook voor potentie-projectie.
const attrClass = v => v >= 16 ? 'at-hi' : v >= 11 ? 'at-mid' : 'at-lo';
// Attribuutfamilies voor de potentie-projectie.
const PHYS_ATTRS = new Set(['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength']);
const MENTAL_ATTRS = new Set(['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision', 'WorkRate']);
const SETPIECE_ATTRS = new Set(['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']);
// Fysieke groei is sterk leeftijdsgebonden: piekt jong, plateaut ~24, daalt na ~30.
function physGrowthFactor(age) {
  if (age == null) return 0.6;
  if (age <= 20) return 1.0;
  if (age <= 23) return 0.8;
  if (age <= 26) return 0.55;
  if (age <= 29) return 0.3;
  if (age <= 32) return 0.12;
  return 0.05;
}
// Mentale groei loopt juist dóór (en versnelt relatief) op latere leeftijd.
function mentalGrowthFactor(age) {
  if (age == null) return 1.0;
  if (age >= 32) return 1.25;
  if (age >= 28) return 1.15;
  return 1.0;
}
// ----- Potentie-projectie: positieprofiel-model, gemeten op de eigen dump -----
// Twee empirische lessen (tools/ca-analysis.js + tools/pos-curve.js, 48k spelers):
//  1) FM's CA-schaal heeft een grote basis (totaal ≈ 148 + 2,1×CA) — ×PA/CA overdreef enorm.
//  2) Wélke attributen meegroeien met CA verschilt sterk per positie: een CA-180-back krijgt
//     er nauwelijks Afwerken bij, wel Voorzetten/Tackelen. Een budget-model zonder positie
//     maakte van elk wonderkind een onrealistische allrounder.
// Daarom per positiegroep het gemeten gemiddelde attribuutprofiel op CA-ankers 80/110/140/170
// (POS_ATTR_PROFILE, gegenereerd met tools/pos-curve.js; validatie: anker-170 wijkt max ~1 punt
// af van echte CA-165+-profielen). Projectie = eigen waarde + (norm(PA) − norm(CA)) van de
// eigen positiegroep(en): de positie-vorm klopt én persoonlijke sterktes/zwaktes blijven.
const POS_CA_ANCHORS = [80, 110, 140, 170];
const POS_ATTR_PROFILE = {ALL:{Crossing:[7.5,9.5,10.7,12],Dribbling:[8.2,10.5,12.1,14.2],Finishing:[7.4,8.9,10,11.8],Heading:[8.3,9.8,10.7,11.7],LongShots:[6.7,9.1,10.5,11.9],Marking:[7.9,9.3,10.3,11.2],OffTheBall:[8.8,11,12.3,13.9],Passing:[9.3,11.3,12.8,14.8],PenaltyTaking:[5,8.1,10,11.2],Tackling:[8.5,9.6,10.8,11.6],Vision:[8.3,10.7,12.4,14.5],Handling:[2.1,2.1,2.1,2.1],AerialReach:[2.1,2.1,2.1,2],CommandOfArea:[2.1,2.1,2.1,2.1],Communication:[2.1,2.1,2.1,2.2],Kicking:[2.1,2.1,2.1,2],Throwing:[2.1,2.1,2.1,2],Anticipation:[9.4,11.6,13.3,15.1],Decisions:[10.9,11.5,12.6,14.4],OneOnOnes:[2.1,2.1,2.1,2.1],Positioning:[8.3,9.9,11.1,12],Reflexes:[2.1,2.1,2.1,2.1],FirstTouch:[10.1,11.6,13,15.1],Technique:[9.9,11.8,13.3,15.2],Flair:[8.9,10.3,11.9,13.8],Corners:[5.5,7.8,8.9,9.6],Teamwork:[9.1,11.7,13.2,14.4],WorkRate:[10.1,12.2,13.7,14.9],LongThrows:[4.7,6.9,7.8,7.7],Eccentricity:[2.1,2.1,2.1,2.1],RushingOut:[2.1,2.1,2.1,2.1],Punching:[2.1,2.1,2.1,2],Acceleration:[11.7,12.3,13.4,14.7],FreeKicks:[5.4,7.8,9.1,10.2],Strength:[8,10.5,11.9,13.5],Stamina:[10,11.9,13.6,14.9],Pace:[11.7,12.3,13.5,14.9],JumpingReach:[9.5,10.6,11.2,12],Leadership:[8.1,9.2,10.2,11.8],Balance:[9.5,11.4,12.9,14.7],Bravery:[8.8,11.2,12.8,13.7],Aggression:[10.4,11.3,12.4,13.3],Agility:[11.2,11.9,13.2,14.8],NaturalFitness:[12.1,12.5,13.4,14.8],Determination:[11.1,12.4,13.8,15.5],Composure:[8.6,11.1,12.7,14.9],Concentration:[8.3,10.7,12.3,13.9]},AMC:{Crossing:[8,10.5,11.9,13.2],Dribbling:[10,12.1,13.7,15.7],Finishing:[9.6,10.5,11.9,13.8],Heading:[6.5,7.9,8.6,9.6],LongShots:[8.4,10.7,12.2,13.8],Marking:[5.8,7,7.9,8.8],OffTheBall:[10.3,12.1,13.5,15.1],Passing:[10.6,12.3,13.8,15.5],PenaltyTaking:[5.9,9.3,11.7,12.6],Tackling:[6.2,7.4,8.4,9.1],Vision:[10.6,12.4,13.9,15.9],Handling:[2.1,2.1,2.1,2.1],AerialReach:[2.1,2.1,2.1,2],CommandOfArea:[2.1,2.1,2.1,2.2],Communication:[2.1,2.1,2.1,2.3],Kicking:[2.1,2.1,2.1,1.9],Throwing:[2.1,2.1,2.2,2.1],Anticipation:[9.1,11.3,13,14.8],Decisions:[10.9,11.6,12.8,14.4],OneOnOnes:[2.1,2.1,2.1,2],Positioning:[6.7,8.2,9.2,9.9],Reflexes:[2.1,2.1,2.1,2.1],FirstTouch:[11.5,12.6,14.2,16.1],Technique:[11.7,13.1,14.8,16.4],Flair:[11.9,13,14.4,15.6],Corners:[6.7,9.9,11.8,12.5],Teamwork:[9.2,11.3,12.7,14.1],WorkRate:[10.2,11.7,13.1,14.6],LongThrows:[4,5.4,5.9,6.5],Eccentricity:[2.1,2.1,2.1,2.1],RushingOut:[2.1,2.1,2.1,1.9],Punching:[2.1,2.1,2.1,1.9],Acceleration:[12,12.3,13.3,14.3],FreeKicks:[6.6,9.8,11.6,12.7],Strength:[6.7,8.8,10,11.9],Stamina:[9.7,11.4,13,14.6],Pace:[11.7,12,13,14.3],JumpingReach:[8,8.6,8.9,9.8],Leadership:[8.1,8.7,9.7,10.9],Balance:[9.1,11.1,12.8,14.6],Bravery:[7.5,9.8,11.2,12.1],Aggression:[9.7,10.1,11,12.1],Agility:[11.5,12.5,14,15.6],NaturalFitness:[12,12.2,13,14.1],Determination:[10.8,12.2,13.4,15.4],Composure:[9.5,11.5,13,15.1],Concentration:[7.5,10,11.6,13.3]},DC:{Crossing:[5.1,7.2,8.4,8.9],Dribbling:[4.8,7.8,9.8,11.3],Finishing:[4,6.1,7,8],Heading:[11,12.7,14,15.4],LongShots:[4.6,6.8,7.7,8.3],Marking:[11.7,12.6,13.9,15.4],OffTheBall:[5.8,8.3,9.5,9.8],Passing:[7.5,10.6,12.4,14.1],PenaltyTaking:[3.9,6.2,7.6,8.4],Tackling:[11.6,12.7,14,15.6],Vision:[6.3,9.5,11.3,13.2],Handling:[2.1,2.1,2.1,2.1],AerialReach:[2.1,2.1,2.1,1.9],CommandOfArea:[2.1,2.1,2.1,2.1],Communication:[2.1,2.1,2.1,2],Kicking:[2.1,2.1,2.1,2.1],Throwing:[2.1,2.1,2.2,2.1],Anticipation:[10,12,13.8,15.8],Decisions:[11.6,11.7,12.7,14.6],OneOnOnes:[2.1,2.1,2.1,1.9],Positioning:[11.6,12.6,13.8,15.5],Reflexes:[2.1,2.1,2,2],FirstTouch:[7.5,10.2,11.7,13.4],Technique:[6.9,10,11.8,13.5],Flair:[5.8,7.1,8.6,9.8],Corners:[3.6,5.1,5.4,5.2],Teamwork:[8.3,11.8,13.6,14.7],WorkRate:[9,12,13.8,15.1],LongThrows:[4.8,7.9,9.4,9.7],Eccentricity:[2.1,2.1,2.2,2],RushingOut:[2.1,2.1,2.2,2.3],Punching:[2.1,2.1,2.1,1.9],Acceleration:[10.6,11.3,12.5,13.8],FreeKicks:[4.1,5.6,6.3,6.6],Strength:[9.7,12.4,14.1,15.8],Stamina:[9.3,11.8,13.5,14.5],Pace:[10.9,11.8,13.4,14.9],JumpingReach:[12.1,13.5,14.4,15.6],Leadership:[8.6,10.6,12,13.7],Balance:[9.4,11.6,13.2,14.2],Bravery:[10.7,12.7,14.2,15.6],Aggression:[11.3,12.4,13.6,14.4],Agility:[10.2,10.7,11.8,13.1],NaturalFitness:[12.1,12.6,13.3,14.7],Determination:[11.2,12.6,14.1,15.9],Composure:[7.5,10.8,12.7,14.9],Concentration:[9.7,11.6,13.2,14.8]},DM:{Crossing:[6,8.7,10.2,11.7],Dribbling:[6.5,9.7,11.6,13.8],Finishing:[6,7.8,9,10.6],Heading:[7.5,9.7,10.4,11.5],LongShots:[7.9,9.7,11.1,12.3],Marking:[9.4,11,12,12.8],OffTheBall:[8,10.4,12,14.2],Passing:[10.8,12.4,13.9,16],PenaltyTaking:[4.8,8.1,10,10.8],Tackling:[11.2,11.9,13.1,14],Vision:[9.9,11.7,13.3,15.5],Handling:[2.1,2.1,2,2],AerialReach:[2.1,2.1,2.1,2.1],CommandOfArea:[2.1,2.1,2,2.4],Communication:[2.1,2.1,2.1,2.3],Kicking:[2.1,2.1,2.1,1.9],Throwing:[2.1,2.1,2.1,1.9],Anticipation:[9.9,12.1,13.8,15.8],Decisions:[11.9,12.1,13.2,15],OneOnOnes:[2.1,2.1,2.1,2.3],Positioning:[10.3,11.9,13.3,14.3],Reflexes:[2.1,2.1,2.1,2],FirstTouch:[10.9,12.1,13.4,15.4],Technique:[10.4,12,13.5,15.5],Flair:[6.8,9.3,11.1,13.6],Corners:[5.5,8,9.6,9.7],Teamwork:[10.2,12.9,14.6,15.5],WorkRate:[11.6,13.2,14.7,15.8],LongThrows:[4.2,6.3,7.2,6.9],Eccentricity:[2.1,2.1,2.1,2.1],RushingOut:[2.1,2.1,2.2,2.1],Punching:[2.1,2.1,2.1,1.9],Acceleration:[10.8,11.4,12.4,13.6],FreeKicks:[6,8.3,9.7,10.1],Strength:[8.4,10.9,12.3,13.8],Stamina:[10.2,12.5,14.4,16.1],Pace:[10.9,11.5,12.6,13.7],JumpingReach:[9.6,10.7,11,11.8],Leadership:[8.6,10.4,11.6,12.4],Balance:[9.7,11.7,13.2,14.9],Bravery:[9.5,12,13.5,14.1],Aggression:[10.9,12.2,13.3,14.1],Agility:[10.4,11.4,12.7,14.4],NaturalFitness:[12.2,12.7,13.9,15.1],Determination:[11.2,12.8,14.2,15.5],Composure:[8.6,11.5,13.2,15.4],Concentration:[9.3,11.6,13.4,14.7]},FB:{Crossing:[9.9,11.3,12.6,13.9],Dribbling:[7.6,10.3,12,13.4],Finishing:[4.9,7.1,8.4,9.9],Heading:[7.6,9.3,10.1,11],LongShots:[5.4,8.1,9.4,10.8],Marking:[9.3,10.9,12,12.7],OffTheBall:[7.8,10.8,12.5,14.2],Passing:[8.8,11,12.4,14.5],PenaltyTaking:[4.3,6.9,8.4,9.3],Tackling:[10.7,11.6,12.8,13.3],Vision:[7.8,10.1,11.7,13.8],Handling:[2.1,2.1,2.1,1.9],AerialReach:[2.1,2.1,2.1,2.2],CommandOfArea:[2.1,2.1,2.2,1.8],Communication:[2.1,2.1,2.1,2.2],Kicking:[2.1,2.1,2,1.8],Throwing:[2.1,2.1,2.1,1.9],Anticipation:[9.3,11.4,12.9,14.8],Decisions:[11.1,11.4,12.4,14.3],OneOnOnes:[2.1,2.1,2.1,2],Positioning:[9.4,11.2,12.4,13.9],Reflexes:[2.1,2.1,2.1,2.2],FirstTouch:[9.3,11,12.5,14.3],Technique:[9.2,11.2,12.7,14.4],Flair:[7.4,9.3,11.1,12.7],Corners:[5.4,8,9.1,9.4],Teamwork:[10,12.2,13.6,14.7],WorkRate:[10.3,12.7,14.2,15.1],LongThrows:[6.5,9.8,11.2,11.1],Eccentricity:[2.1,2.1,2.2,2.1],RushingOut:[2.1,2.1,2.2,2.4],Punching:[2.1,2.1,2.1,2.1],Acceleration:[12.4,12.8,14,15.4],FreeKicks:[4.3,7.1,8.5,9.5],Strength:[8,10.2,11.7,13.5],Stamina:[10.9,12.4,14.1,15.2],Pace:[12.2,12.7,14.1,15.5],JumpingReach:[9.2,9.9,10.7,11.6],Leadership:[8.3,9,10,11.3],Balance:[9.8,11.3,12.7,14.5],Bravery:[9.9,11.6,13.2,14],Aggression:[10.5,11.5,12.8,14],Agility:[11.8,12.2,13.3,14.9],NaturalFitness:[12.2,12.7,13.7,15.1],Determination:[11.1,12.4,13.9,15.6],Composure:[7.8,10.5,12.2,14.4],Concentration:[9.7,11.2,12.6,14.1]},GK:{Crossing:[2.1,2.3,2.3,2.3],Dribbling:[2.1,2.4,2.8,3.7],Finishing:[2,2.1,2.1,2.2],Heading:[4.3,5.3,5.4,7.3],LongShots:[2.1,2.5,2.7,2.5],Marking:[2.1,2.3,2.4,1.8],OffTheBall:[2.4,3.4,4.1,3.9],Passing:[8.2,10.1,11.3,12.6],PenaltyTaking:[2.4,2.8,3.5,4.8],Tackling:[2.1,2.5,2.6,3],Vision:[6.6,9,10.5,12],Handling:[11.5,12.3,13.4,15.1],AerialReach:[11.4,13.2,14.1,15.4],CommandOfArea:[9.6,11.5,12.9,14.6],Communication:[9,11.4,12.8,14.6],Kicking:[9.9,11.6,13,14],Throwing:[8.7,11.6,13.2,14.3],Anticipation:[8.8,11.5,13,14.5],Decisions:[11.7,11.5,12.4,13.9],OneOnOnes:[9.9,12.6,14.4,16.6],Positioning:[9.7,12.1,13.3,15.1],Reflexes:[12,13.3,15.2,17.1],FirstTouch:[4.3,7.6,9.7,11.9],Technique:[4.9,8.1,9.9,12],Flair:[2.5,4.4,5.7,8.2],Corners:[3.2,3.7,4.1,4.7],Teamwork:[7.7,10.8,12.2,12.9],WorkRate:[6.8,10.3,11.9,13.4],LongThrows:[2.1,2.6,2.9,3],Eccentricity:[6.5,8,8.9,9.3],RushingOut:[9.5,10.7,12,13.2],Punching:[9.3,10.3,11,10.6],Acceleration:[9.4,9.7,10.3,11.1],FreeKicks:[4.3,4.9,5.2,5.4],Strength:[7.4,10.8,12.4,13.4],Stamina:[5.7,9.4,11.3,12.2],Pace:[8.9,9.6,10.3,11.3],JumpingReach:[12.7,14.1,14.9,15.6],Leadership:[8,9.9,11.4,13],Balance:[8.3,10.8,12,12.4],Bravery:[11.5,12.2,13.2,14.1],Aggression:[9.2,9.5,10.1,11.7],Agility:[10.7,12,13.3,15],NaturalFitness:[11.7,12.2,13.1,13.6],Determination:[11.1,12.3,13.6,15.5],Composure:[7.2,10.7,12.6,14.3],Concentration:[10.2,11.6,12.9,14.5]},MC:{Crossing:[6.7,9.5,10.9,12.2],Dribbling:[7.6,10.6,12.3,14.3],Finishing:[7.2,8.8,10.1,11.8],Heading:[6.6,8.7,9.6,10.9],LongShots:[8.4,10.3,11.6,13],Marking:[8.3,9.7,10.7,11.8],OffTheBall:[9.1,11.3,12.7,14.7],Passing:[11.4,12.7,14,15.9],PenaltyTaking:[5.1,8.6,10.7,11.5],Tackling:[9.1,10.5,11.6,12.6],Vision:[10.8,12.2,13.6,15.7],Handling:[2.1,2.1,2.1,2.1],AerialReach:[2.1,2.1,2.1,2.1],CommandOfArea:[2.1,2.1,2.1,2.2],Communication:[2.1,2.1,2.1,2.2],Kicking:[2.1,2.1,2.1,1.9],Throwing:[2.1,2.1,2.2,1.9],Anticipation:[9.4,11.9,13.5,15.3],Decisions:[11.5,12,13.1,14.9],OneOnOnes:[2.1,2.1,2.1,2.2],Positioning:[8.7,10.8,12.1,13.2],Reflexes:[2.1,2.1,2.1,2],FirstTouch:[11.6,12.4,13.7,15.6],Technique:[11.2,12.6,14,15.8],Flair:[8.8,10.7,12.4,14.4],Corners:[6.1,9,10.6,11],Teamwork:[9.9,12.5,14.1,15.3],WorkRate:[11.4,12.9,14.2,15.6],LongThrows:[4.1,6,6.8,7],Eccentricity:[2.1,2.1,2.1,2.1],RushingOut:[2.1,2.1,2.2,2.2],Punching:[2.1,2.1,2.1,1.9],Acceleration:[11.3,11.7,12.6,13.8],FreeKicks:[6.2,9,10.5,11.4],Strength:[7.7,10.1,11.5,13.1],Stamina:[10.3,12.2,14.1,15.8],Pace:[11.3,11.7,12.7,13.9],JumpingReach:[8.8,9.7,10.3,11.2],Leadership:[8.4,9.9,11,12.1],Balance:[9.4,11.5,13,14.5],Bravery:[8.3,11.2,12.8,13.8],Aggression:[10.6,11.6,12.6,13.8],Agility:[11,11.9,13.1,14.7],NaturalFitness:[12.2,12.5,13.6,15],Determination:[11.2,12.6,13.9,15.7],Composure:[8.9,11.6,13.2,15.3],Concentration:[8.7,11.1,12.8,14.4]},ST:{Crossing:[6.5,8.7,9.7,11.4],Dribbling:[10.6,11.3,12.4,14.9],Finishing:[11.8,12.4,13.9,15.5],Heading:[10.5,11.5,12.7,12.5],LongShots:[7,9.8,11.4,13],Marking:[4.8,6.2,6.9,7.6],OffTheBall:[11.3,12.7,14.1,15.7],Passing:[8.2,10.4,11.8,13.8],PenaltyTaking:[6.4,10.2,12.6,14.5],Tackling:[4.1,6,6.9,7.5],Vision:[7.4,10.1,11.8,13.9],Handling:[2.1,2.1,2.1,2],AerialReach:[2.1,2.1,2.1,2],CommandOfArea:[2.1,2.1,2.1,2.1],Communication:[2.1,2.1,2.1,2.2],Kicking:[2.1,2.1,2.1,2.1],Throwing:[2.1,2.1,2.1,1.9],Anticipation:[9.8,11.8,13.4,15.2],Decisions:[10,11.2,12.4,14.1],OneOnOnes:[2.1,2.1,2.2,2.3],Positioning:[5.7,7.4,7.9,8.1],Reflexes:[2.1,2.1,2.1,1.9],FirstTouch:[11,11.8,13,15.2],Technique:[10.5,11.9,13.4,15.4],Flair:[11,11.5,12.9,15.2],Corners:[5.3,7,7.6,8.9],Teamwork:[8.2,11,12.6,13.9],WorkRate:[9.1,12,13.5,14.4],LongThrows:[3.7,5.5,6.1,6.4],Eccentricity:[2.1,2.1,2.1,2.4],RushingOut:[2.1,2.1,2.1,1.8],Punching:[2.1,2.1,2,2.2],Acceleration:[12,12.5,13.6,15.5],FreeKicks:[5.5,7.7,8.9,10.4],Strength:[8.5,11.4,13,13.8],Stamina:[9.7,11.6,13.2,14.3],Pace:[11.8,12.7,13.8,15.6],JumpingReach:[10,11.8,12.5,12.5],Leadership:[7.8,8.4,9.3,11],Balance:[9.5,11.7,13.1,14.9],Bravery:[7.8,11,12.8,13.2],Aggression:[9.8,10.9,12.2,12.8],Agility:[11.1,11.8,13,15.2],NaturalFitness:[12.1,12.3,13.2,14.9],Determination:[11,12.4,14,15.3],Composure:[10.2,11.6,13,14.9],Concentration:[6.9,10.1,11.8,13.1]},W:{Crossing:[10,11.1,12.2,13.9],Dribbling:[10.7,12.4,14,16.4],Finishing:[9,10.3,11.6,14.1],Heading:[6.4,7.9,8.4,9.2],LongShots:[7.1,10,11.6,13.1],Marking:[5.4,6.7,7.5,8],OffTheBall:[10.2,12,13.3,15.3],Passing:[9.8,11.3,12.5,14.6],PenaltyTaking:[5.4,8.8,10.8,12.4],Tackling:[5.5,6.9,7.7,7.8],Vision:[8.4,10.9,12.6,14.9],Handling:[2.1,2.1,2,2.3],AerialReach:[2.1,2.1,2.1,2],CommandOfArea:[2.1,2.1,2.1,1.9],Communication:[2.1,2.1,2.1,2.2],Kicking:[2.1,2.1,2.1,2],Throwing:[2.1,2.1,2.1,2.1],Anticipation:[8.7,11,12.5,14.3],Decisions:[9.7,10.8,12,14],OneOnOnes:[2.1,2.1,2.1,2.2],Positioning:[5.8,7.5,8.4,8.7],Reflexes:[2.1,2.1,2.1,2],FirstTouch:[10.8,12,13.4,15.8],Technique:[11,12.5,14.1,16.2],Flair:[11.5,12.7,14.2,16],Corners:[6.8,9.3,10.8,12.3],Teamwork:[9,10.7,12,13.2],WorkRate:[10.1,11.6,12.9,14.1],LongThrows:[4.7,6.2,6.6,6.2],Eccentricity:[2.1,2.1,2.1,2.2],RushingOut:[2.1,2.1,2.1,1.8],Punching:[2.1,2.1,2.1,2],Acceleration:[12.5,13.2,14.5,15.7],FreeKicks:[6.1,8.8,10.4,11.8],Strength:[6.6,8.9,10.1,11.6],Stamina:[10,11.4,12.9,14.1],Pace:[12.3,12.9,14.1,15.2],JumpingReach:[7.9,8.6,8.9,9.6],Leadership:[7.7,7.8,8.5,10.4],Balance:[9.5,11.1,12.6,14.7],Bravery:[7.5,9.8,11.3,12],Aggression:[9.6,10.1,11.1,11.6],Agility:[12.2,12.9,14.4,16.2],NaturalFitness:[12,12.2,13.1,14.4],Determination:[11.1,12.1,13.4,15.2],Composure:[8.4,10.7,12.3,14.5],Concentration:[6.9,9.6,11.1,12.9]}};
const POS_GROUP_OF = { GK: 'GK', SW: 'DC', DC: 'DC', DL: 'FB', DR: 'FB', WBL: 'FB', WBR: 'FB',
  DM: 'DM', MC: 'MC', ML: 'W', MR: 'W', AML: 'W', AMR: 'W', AMC: 'AMC', ST: 'ST' };
const posGroupsOf = p => {
  const gs = [...new Set((p.posArr || []).map(x => POS_GROUP_OF[x]).filter(g => POS_ATTR_PROFILE[g]))];
  return gs.length ? gs : ['ALL'];
};
// Positienorm voor attribuut-ankers a op willekeurige CA (lineair tussen ankers, doorgetrokken erbuiten).
function posNorm(a, ca) {
  if (ca <= 80) return a[0] - (80 - ca) * (a[1] - a[0]) / 30;
  if (ca >= 170) return a[3] + (ca - 170) * (a[3] - a[2]) / 30;
  for (let i = 1; i < 4; i++)
    if (ca <= POS_CA_ANCHORS[i]) return a[i - 1] + (a[i] - a[i - 1]) * (ca - POS_CA_ANCHORS[i - 1]) / 30;
  return a[3];
}

function projectAttrs(p) {
  if (!p.pa || !p.ca || p.pa <= p.ca || !p.attrs) return null;
  const age = getAge(p);
  // De positienormen zijn al "leeftijdsecht" (CA-180-spelers zijn doorgaans ~25): een jonge
  // speler groeit er vanzelf realistisch fysiek bij. Alleen voor oudere spelers met rest-
  // potentieel dempen we fysieke groei extra — die komt er niet meer.
  const physF = age == null || age <= 23 ? 1 : physGrowthFactor(age);
  const groups = posGroupsOf(p);
  const keys = Object.keys(p.attrs)
    .filter(k => !['Consistency', 'ImportantMatches', 'Versatility', 'InjuryProneness', 'Dirtiness'].includes(k));
  const proj = {};
  for (const k of keys) {
    let d = 0, n = 0;
    for (const g of groups) {
      const a = POS_ATTR_PROFILE[g][k];
      if (a) { d += Math.max(0, posNorm(a, p.pa) - posNorm(a, p.ca)); n++; }
    }
    d = n ? d / n : 0;
    if (PHYS_ATTRS.has(k)) d *= physF;
    proj[k] = Math.min(20, Math.round(p.attrs[k] + d));
  }
  return proj;
}
// Profielweergave: 'side' = paneel rechts (default), 'popup' = gecentreerde modal.
function profMode() { return localStorage.getItem('fmss_profmode') || 'side'; }
function closeDetail() {
  $('detail').classList.add('hidden');
  $('detail-backdrop').classList.add('hidden');
  state.selected = null; renderVisible();
}
function showDetail(p) {
  state.selected = p;
  renderVisible();
  const pop = profMode() === 'popup';
  $('detail').classList.toggle('popup', pop);
  $('detail-backdrop').classList.toggle('hidden', !pop);
  $('detail').classList.remove('hidden');
  const isPlayer = !!p.attrs;
  const on = state.shortlist.has(p.id);
  const ev = estValue(p);
  const valTxt = ev.v == null || ev.v === 0 ? '–' : ev.est ? `${fmtMoney(ev.lo)} – ${fmtMoney(ev.hi)}` : fmtMoney(ev.v);

  const gauge = (!state.hideCapa && (p.ca != null || p.pa != null)) ? `<div class="capa">
    <div class="capa-nums"><span><b>CA</b> <span class="ca-bar">${p.ca ?? '–'}</span></span><span><b>PA</b> <span class="pa-bar">${p.pa ?? '–'}</span></span></div>
    <div class="capa-track"><span class="capa-pa" style="width:${Math.min(100, (p.pa ?? 0) / 2)}%"></span><span class="capa-ca" style="width:${Math.min(100, (p.ca ?? 0) / 2)}%"></span></div>
  </div>` : '';
  const inCmp = state.compare.includes(p.id);
  let html = `<h2>${escHtml(p.name)} ${isPlayer ? `<span class="detail-star ${on ? 'on' : ''}" data-star="${p.id}">${starSvg(18)}</span>` : ''}
    <button class="copybtn" title="${t('copyBtnTip')}">${icon('clipboard', 13)}</button>
    <button class="cmpbtn ${inCmp ? 'on' : ''}" title="${t('addCompare')}">${icon('compare', 13)}</button>${isPlayer && p.attrs ? `<button class="cardbtn" title="${t('cardBtnTip')}">${icon('card', 13)}</button>` : ''}</h2>
  <div class="sub">${getAge(p)} · ${escHtml(natsLabel(p))}${isEu(p) ? ' · <span class="eu-yes">EU</span>' : ''} · ${clubLabel(p)}${p.div ? ` · <span class="dim">${escHtml(playerDivisionLabel(p))}</span>` : ''}</div>
  ${gauge}
  <div class="kv">
    ${isPlayer ? `<div><b>${t('c_pos')}</b> ${escHtml(p.pos || '–')}</div><div><b>${t('foot')}</b> ${escHtml(footLabel(p))}</div>` : `<div><b>${t('c_role')}</b> ${escHtml(jobLabel(p))}</div>`}
    <div><b>${t('estval')}</b> ${valTxt}</div>
    ${!state.hideCapa && feeEstimate(p).v > 0 ? `<div><b>${t('c_fee')}</b> ${fmtMoney(feeEstimate(p).v * 0.85)} – ${fmtMoney(feeEstimate(p).v * 1.15)}</div>` : ''}
    <div><b>${t('wageLabel')}</b> ${fmtWage(p.wage)}${p.wage > 0 ? ` <span class="dim">${wageSuf()}</span>` : ''}</div>
    ${p.worldRep ? `<div><b>${t('repLabel')}</b> ${p.worldRep}</div>` : ''}
    <div><b>${t('contractLabel')}</b> ${fmtDate(p.expires)}</div>
    ${p.ownerClub && p.ownerClub !== p.club ? `<div><b>${t('ownerLabel')}</b> ${escHtml(p.ownerClub)}</div>` : ''}
    ${p.height ? `<div><b>${t('height')}</b> ${p.height} cm</div>` : ''}
    ${isPlayer && !state.hideMeta && p.attrs ? (() => {
      const positions = metaScoresByPosition(p, p.attrs);
      if (!positions.length) return '';
      const paMeta = !state.hideCapa ? metaPaScore(p) : null;
      const bestGroup = positions.length ? positions[0].group : null;
      const paRow = paMeta != null
        ? `<div data-help="metaPaHint" style="margin-bottom:2px"><b>${t('c_metapa')}<\/b> <span class="${metaClass(paMeta, bestGroup)}">${fmtMeta(paMeta)}<\/span> <span class="col-help">?<\/span><\/div>`
        : '';
      const td = (a = 'left') => `style="text-align:${a};padding:1px 5px 1px 0"`;
      const th = (a = 'left') => `style="text-align:${a};padding:0 5px 3px 0;opacity:0.5;font-weight:normal"`;
      const rows = positions.map(({ pos, group, prof, meta, effectiveMeta }) => {
        const profCell = prof != null ? `<span class="${attrClass(prof)}">${prof}<\/span>` : '<span class="dim">?<\/span>';
        return `<tr><td ${td()}>${pos}<\/td><td ${td('right')}>${profCell}<\/td><td ${td('right')}><span class="${metaClass(meta, group)}">${fmtMeta(meta)}<\/span><\/td><td ${td('right')}><span class="${metaClass(effectiveMeta, group)}">${fmtMeta(effectiveMeta)}<\/span><\/td><\/tr>`;
      }).join('');
      return `${paRow}<table data-help="metaHint" style="border-collapse:collapse;width:100%;font-size:0.83em;margin-top:2px"><tr><th ${th()}>Pos<\/th><th ${th('right')}>Prof<\/th><th ${th('right')}>Meta<\/th><th ${th('right')}>Eff<\/th><\/tr>${rows}<\/table>`;
    })() : ''}
  </div>`;

  const flags = [];
  if (isFree(p)) flags.push(`<span class="pill">${t('tag_free')}</span>`);
  if (p.listed) flags.push(`<span class="pill warn">${t('tag_listed')}</span>`);
  if (p.loanListed) flags.push(`<span class="pill warn">${t('tag_loan')}</span>`);
  if (p.setForRelease) flags.push(`<span class="pill warn">${t('tag_rel')}</span>`);
  if (p.notForSale) flags.push(`<span class="pill">${t('tag_nfs')}</span>`);
  if (isAttainable(p)) flags.push(`<span class="pill good" data-help="attainHint">${t('attainable')}</span>`);
  if (flags.length) html += '<div>' + flags.join('') + '</div>';

  if (isPlayer) {
    const i = interestEstimate(p);
    if (i) html += `<div class="interest-box" data-help="interestHint"><b>${t('interestTitle')}:</b> <span class="int ${i.cls}">${i.label}</span> <span class="dim">(${i.score}/100)</span> <span class="col-help">?</span>${i.note ? `<div class="int-note">${t(i.note === 'minor' ? 'minorNote' : 'minorIntlNote')}</div>` : ''}</div>`;
    html += '<div id="dev-box"></div>';   // ontwikkel-grafiek (trends) laadt async
  }


  if (isPlayer && p.attrs) {
    // Potentie leunt op PA (verborgen stat): toggle alleen tonen als verborgen stats aan staan.
    const canPot = !state.hideCapa && p.pa > p.ca;
    if (!state.hideCapa)
      html += `<label class="potswitch${canPot ? '' : ' off'}"><input type="checkbox" id="pot-toggle" ${state.showPot ? 'checked' : ''} ${canPot ? '' : 'disabled'}> ${t('showPot')}${state.showPot ? ` <span class="dim">(${t('potNote')})</span>` : ''}</label>`;
    // A player is a "GK" for display purposes only when GK is their natural primary position.
    // posArr includes GK for virtually every FM player (all positions appear at prof=1), so
    // checking posArr would incorrectly show the Goalkeeping panel for all outfield players.
    const isGk = p.pos === 'GK';
    const groups = isGk ? ATTR_GROUPS_GK : ATTR_GROUPS_OUTFIELD;
    const proj = (!state.hideCapa && state.showPot) ? projectAttrs(p) : null;

    // Meta-contribution indicator: shows (val − baseline) × coeff for the player's best position.
    // Only available when the Direct engine is active (META_PRESET.coeffs != null).
    const metaPositions = metaScoresByPosition(p, p.attrs);
    const bestMetaGroup = metaPositions.length ? metaPositions[0].group : null;
    const gCoeffs = (bestMetaGroup && META_PRESET.coeffs) ? META_PRESET.coeffs[bestMetaGroup] : null;
    const metaBaseline = META_PRESET.baseline ?? 8;
    const contribSpan = (k, val) => {
      if (!gCoeffs) return '';
      const coeff = gCoeffs[k] ?? 0;
      if (!coeff) return '';
      const c = (val - metaBaseline) * coeff;
      const sign = c >= 0 ? '+' : '';
      const cls = c >= 0 ? 'pos' : 'neg';
      return `<span class="attr-contrib ${cls}">${sign}${c.toFixed(2)}</span>`;
    };

    const col = {};
    for (const [gk, keys] of groups) {
      const rows = sortByLabel(keys).filter(k => p.attrs[k] != null);
      col[gk] = !rows.length ? '' : `<div class="attr-col"><h3>${t(gk)}</h3>` + rows.map((k, idx) => {
        const raw = p.attrs[k];
        const shown = proj ? (proj[k] ?? raw) : raw;
        const grew = state.showPot && shown > raw;
        return `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${attrName(k)}</span>${contribSpan(k, shown)}<span class="v ${attrClass(shown)}${grew ? ' grew' : ''}">${shown}</span></div>`;
      }).join('') + '</div>';
    }
    // Persoonlijkheid (verborgen kenmerken) — net als een normale eigenschappengroep.
    const pd = [['ambition', p.ambition], ['professionalism', p.professionalism], ['loyalty', p.loyalty],
      ['pressure', p.pressure], ['temperament', p.temperament], ['sportsmanship', p.sportsmanship],
      ['adaptability', p.adaptability], ['controversy', p.controversy]].filter(x => x[1] > 0);
    const persHtml = pd.length ? `<div class="attr-col"><h3>${t('personaTitle')}</h3>` + pd.map(([k, v], idx) =>
      `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${t(k)}</span><span class="v ${attrClass(v)}">${v}</span></div>`).join('') + '</div>' : '';
    // Overige verborgen kenmerken. Bij InjuryProneness/Dirtiness is HOOG slecht → kleur omkeren.
    // Hidden attrs (Consistency, ImportantMatches, Versatility) can have meta coefficients too.
    const hd = [['Consistency', true], ['ImportantMatches', true], ['Versatility', true],
      ['InjuryProneness', false], ['Dirtiness', false]]
      .map(([k, good]) => [k, p.attrs ? p.attrs[k] : 0, good]).filter(x => x[1] > 0);
    const hidHtml = hd.length ? `<div class="attr-col"><h3>${t('hiddenTitle')}</h3>` + hd.map(([k, v, good], idx) => {
      const cls = good ? attrClass(v) : attrClass(21 - v);   // "slecht-hoog": omgekeerde kleur
      return `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${t('a_' + k)}</span>${contribSpan(k, v)}<span class="v ${cls}">${v}</span></div>`;
    }).join('') + '</div>' : '';
    // Grid: links Technisch/Keepen + Standaardsituaties (Mentaal loopt ernaast over 2 rijen),
    // onderste rij links Fysiek + Verborgen kenmerken, rechts Persoonlijkheid.
    const techKey = isGk ? 'g_goalkeeping' : 'g_technical';
    html += `<div class="attr-grid">
      <div style="grid-area:tech">${col[techKey] || ''}</div>
      <div style="grid-area:sp">${col['g_setpieces'] || ''}</div>
      <div style="grid-area:ment">${col['g_mental'] || ''}</div>
      <div style="grid-area:phys">${col['g_physical'] || ''}${state.hideCapa ? '' : hidHtml}</div>
      <div style="grid-area:pers">${state.hideCapa ? '' : persHtml}</div>
    </div>`;
  } else if (p.staffAttrs) {
    html += `<div class="attr-cols"><div class="attr-col"><h3>${t('staffAttrs')}</h3>` +
      Object.entries(p.staffAttrs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v], idx) =>
        `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${staffAttrName(k)}</span><span class="v ${attrClass(v)}">${v}</span></div>`).join('') + '</div></div>';
  }
  $('detail-body').innerHTML = html;
  const star = document.querySelector('.detail-star');
  if (star) star.onclick = () => toggleShortlist(p.id);
  document.querySelector('.copybtn').onclick = () => copyName(p.name);
  const cmp = document.querySelector('.cmpbtn');
  if (cmp) cmp.onclick = () => { toggleCompare(p.id); cmp.classList.toggle('on', state.compare.includes(p.id)); };
  const cb = document.querySelector('.cardbtn');
  if (cb) cb.onclick = () => downloadPlayerCard(p);
  const pt = $('pot-toggle');
  if (pt) pt.onchange = () => { state.showPot = pt.checked; showDetail(p); };
  if (isPlayer) renderDevChart(p);
  if (p.id !== state._donLast) { state._donLast = p.id; bumpStat('fmss_uses'); }   // teller voor het seizoensrapport
}

// ---------- ontwikkel-grafiek (trends in het profiel) ----------
// Haalt de opgeslagen reeks van deze speler op en tekent maximaal twee mini-panelen:
// CA/PA (verborgen als verborgen stats uit staan) en marktwaarde. Aparte panelen omdat
// het twee verschillende schalen zijn (nooit een dubbele y-as). Stippen markeren echte
// meetpunten (delta-opslag); tussenliggende dumps zonder wijziging lopen vlak door.
async function renderDevChart(p) {
  try {
    const r = await fetch(`/api/history/series?uid=${p.id}&manager=${encodeURIComponent(state.meta.manager || 'default')}`);
    if (!r.ok) return;
    const { dates, entries } = await r.json();
    const box = $('dev-box');
    if (!box || state.selected !== p) return;   // gebruiker klikte al door
    // Reeks reconstrueren: vanaf het eerste meetpunt elke datum invullen (carry-forward).
    const pts = [];
    let cur = null;
    for (const d of dates) {
      const e = entries[d];
      if (e) cur = e;
      if (cur) pts.push({ d, ca: cur[0], pa: cur[1], v: cur[2], real: !!e });
    }
    if (pts.length < 2) return;
    const panels = [];
    if (!state.hideCapa) panels.push(devPanel(pts, 'capa'));
    if (pts.some(q => q.v > 0)) panels.push(devPanel(pts, 'value'));
    if (!panels.length) return;
    box.innerHTML = `<div class="attr-col dev-col"><h3>${t('devTitle')}</h3><div class="dev-wrap">${panels.join('')}</div></div>`;
  } catch { /* geen historie beschikbaar */ }
}

function devPanel(pts, kind) {
  // Linkergoot voor de y-labels (geld is breder dan een CA-getal), zodat labels en
  // datapunten elkaar nooit raken; rechts ruimte voor de CA/PA-lijnlabels.
  const W = 200, H = 84, padL = kind === 'capa' ? 26 : 36, padR = kind === 'capa' ? 24 : 8, padT = 11, padB = 14;
  const n = pts.length;
  const x = i => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1));
  const series = kind === 'capa'
    ? [{ get: q => q.ca, cls: 'dvl-ca', dash: '', label: 'CA' },
       { get: q => q.pa, cls: 'dvl-pa', dash: '4 3', label: 'PA' }]
    : [{ get: q => q.v, cls: 'dvl-v', dash: '', label: '' }];
  const all = pts.flatMap(q => series.map(s => s.get(q))).filter(v => v != null && v > 0);
  // Echte uitersten apart houden: de as krijgt lucht, maar de labels moeten getallen tonen
  // die écht in de reeks voorkomen. Anders staat er "172" boven een speler met PA 168.
  const loReal = Math.min(...all), hiReal = Math.max(...all);
  let lo = loReal, hi = hiReal;
  // Minimale as-spanwijdte: piepkleine verschillen (waarde-geruis van 0,1%, CA +1) mogen
  // niet als steile lijnen ogen doordat de as op min/max krimpt. CA/PA-as minstens 12
  // punten, waarde-as minstens 12% van het midden; echte sprongen vullen het paneel nog.
  const midV = (lo + hi) / 2;
  const minSpan = kind === 'capa' ? 12 : Math.max(1, midV * 0.12);
  if (hi - lo < minSpan) { lo = midV - minSpan / 2; hi = midV + minSpan / 2; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const fmtV = v => kind === 'capa' ? Math.round(v) : fmtMoney(v);
  const fmtD = d => `${d.slice(5, 7)}-'${d.slice(2, 4)}`;

  let g = '';
  // basislijn + min/max-labels in de linkergoot (terughoudend, tekst nooit in seriekleur)
  g += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="dv-axis"/>`;
  // Labels op de hoogte van de échte uiterste waarden, niet op de opgerekte as-randen.
  g += `<text x="${padL - 3}" y="${(y(hiReal) + 3).toFixed(1)}" class="dv-lbl" text-anchor="end">${fmtV(hiReal)}</text>`;
  if (Math.abs(y(loReal) - y(hiReal)) > 10)
    g += `<text x="${padL - 3}" y="${(y(loReal) + 3).toFixed(1)}" class="dv-lbl" text-anchor="end">${fmtV(loReal)}</text>`;
  g += `<text x="${padL}" y="${H - 3}" class="dv-lbl">${fmtD(pts[0].d)}</text>`;
  g += `<text x="${W - padR}" y="${H - 3}" class="dv-lbl" text-anchor="end">${fmtD(pts[n - 1].d)}</text>`;
  const endLbls = [];
  for (const s of series) {
    // null-veilig pad: ontbrekende waardes breken de lijn i.p.v. naar de bodem te duiken
    let path = '', pen = false, lastY = null;
    pts.forEach((q, i) => {
      const v = s.get(q);
      if (v == null || v <= 0) { pen = false; return; }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true; lastY = y(v);
      if (q.real) g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2" class="dvd ${s.cls}"/>`;
    });
    g += `<path d="${path}" class="dvl ${s.cls}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.label && lastY != null) endLbls.push({ txt: s.label, y: lastY + 3 });
  }
  // Eindlabels (CA/PA) uit elkaar duwen als de lijnen vrijwel samenvallen; identiteit
  // hangt niet alleen aan kleur (PA is ook gestippeld), maar overlappend is onleesbaar.
  if (endLbls.length === 2 && Math.abs(endLbls[0].y - endLbls[1].y) < 11) {
    const mid = (endLbls[0].y + endLbls[1].y) / 2;
    const [a, b] = endLbls[0].y <= endLbls[1].y ? endLbls : [endLbls[1], endLbls[0]];
    a.y = mid - 5.5; b.y = mid + 5.5;
  }
  for (const l of endLbls) g += `<text x="${W - padR + 3}" y="${l.y.toFixed(1)}" class="dv-lbl">${l.txt}</text>`;
  // Hover-banen (volle hoogte, breder dan de stip) met een tooltip in app-stijl per
  // dumpdatum. PA staat er alleen bij als die in deze reeks echt beweegt; bij een vaste PA
  // is het ruis naast het lijnlabel dat het al zegt.
  const paVaries = kind === 'capa' && new Set(pts.map(q => q.pa)).size > 1;
  const seg = (W - padL - padR) / Math.max(1, n - 1);
  pts.forEach((q, i) => {
    const tip = kind === 'capa'
      ? `${fmtDate(q.d)} · CA ${q.ca}${paVaries ? ` · PA ${q.pa}` : ''}`
      : `${fmtDate(q.d)} · ${q.v > 0 ? fmtMoney(q.v) : '–'}`;
    g += `<rect x="${(x(i) - seg / 2).toFixed(1)}" y="0" width="${seg.toFixed(1)}" height="${H}" class="dv-hit" data-tip="${escHtml(tip)}"/>`;
  });
  // Verandering over het getoonde venster, in de kop van het paneel: groen omhoog, rood omlaag.
  const main = series[0];
  const vals = pts.map(main.get).filter(v => v != null && v > 0);
  let delta = '';
  if (vals.length > 1) {
    const dv = vals[vals.length - 1] - vals[0];
    if (dv !== 0) {
      const sign = dv > 0 ? '+' : '−';
      const txt = kind === 'capa' ? sign + Math.abs(Math.round(dv)) : sign + fmtMoney(Math.abs(dv));
      delta = `<span class="dev-delta ${dv > 0 ? 'up' : 'down'}" data-help="devDeltaHint">${txt}</span>`;
    }
  }
  const cap = kind === 'capa' ? 'CA / PA' : t('cmpValue');
  return `<div class="dev-panel"><div class="dev-cap">${cap}${delta}</div><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>`;
}

// ---------- deelbare spelerskaart (PNG) — v3, FM-native ----------
// Ontwerptaal van FM zelf, zodat FM-spelers de kaart in één oogopslag lezen: het volledige
// attributengrid met FM-kleuren (groen = klasse, een muur van groen = viral regen),
// scout-sterren voor huidig en potentieel vermogen, beste rollen en financiën.
// Tier-accent volgt CA; wonderkids (zie isWonderkid) krijgen goud + badge. Labels app-taal.
// Kaartlabels apart van de hoofd-i18n gehouden: veel kaart-only strings, bij elkaar leesbaarder.
const CARDL = {
  nl: { meta: 'META', cur: 'HUIDIG', pot: 'POTENTIEEL', roles: 'BESTE ROLLEN', value: 'WAARDE',
    ask: 'VRAAGPRIJS', wage: 'LOON', contract: 'CONTRACT', rep: 'Reputatie', inj: 'Blessures',
    wk: '★ WONDERKID', repW: 'Wereldwijd', repC: 'Continentaal', repN: 'Nationaal', repL: 'Lokaal',
    injL: 'Laag', injM: 'Gemiddeld', injH: 'Hoog',
    sListed: 'OP TRANSFERLIJST', sLoan: 'TE HUUR', sRel: 'VRIJGEGEVEN', sNfs: 'NIET TE KOOP', sFree: 'CLUBLOOS' },
  en: { meta: 'META', cur: 'CURRENT', pot: 'POTENTIAL', roles: 'TOP ROLES', value: 'VALUE',
    ask: 'ASKING PRICE', wage: 'WAGE', contract: 'CONTRACT', rep: 'Reputation', inj: 'Injury',
    wk: '★ WONDERKID', repW: 'Worldwide', repC: 'Continental', repN: 'National', repL: 'Local',
    injL: 'Low', injM: 'Medium', injH: 'High',
    sListed: 'TRANSFER LISTED', sLoan: 'FOR LOAN', sRel: 'RELEASED', sNfs: 'NOT FOR SALE', sFree: 'FREE AGENT' },
  fr: { meta: 'MÉTA', cur: 'ACTUEL', pot: 'POTENTIEL', roles: 'MEILLEURS RÔLES', value: 'VALEUR',
    ask: 'PRIX DEMANDÉ', wage: 'SALAIRE', contract: 'CONTRAT', rep: 'Réputation', inj: 'Blessures',
    wk: '★ WONDERKID', repW: 'Mondiale', repC: 'Continentale', repN: 'Nationale', repL: 'Locale',
    injL: 'Faible', injM: 'Moyenne', injH: 'Élevée',
    sListed: 'TRANSFÉRABLE', sLoan: 'À PRÊTER', sRel: 'LIBÉRÉ', sNfs: 'PAS À VENDRE', sFree: 'LIBRE' },
  de: { meta: 'META', cur: 'AKTUELL', pot: 'POTENZIAL', roles: 'BESTE ROLLEN', value: 'WERT',
    ask: 'FORDERUNG', wage: 'GEHALT', contract: 'VERTRAG', rep: 'Reputation', inj: 'Verletzungen',
    wk: '★ WONDERKID', repW: 'Weltweit', repC: 'Kontinental', repN: 'National', repL: 'Lokal',
    injL: 'Gering', injM: 'Mittel', injH: 'Hoch',
    sListed: 'AUF TRANSFERLISTE', sLoan: 'ZU VERLEIHEN', sRel: 'FREIGESTELLT', sNfs: 'UNVERKÄUFLICH', sFree: 'VEREINSLOS' },
};
// Kaartkolommen zoals FM ze zelf indeelt: standaardsituaties horen bij Technisch (de app
// splitst ze in het profiel, de kaart voegt ze weer samen → 14 rijen, net als Mentaal).
function cardGroups(p, isGk) {
  const a = p.attrs || {};
  // > 0: FM-attributen lopen 1-20; 0 betekent "niet in de dump" en hoort niet op de kaart.
  const pick = keys => sortByLabel(keys).filter(k => a[k] > 0).map(k => [attrName(k), a[k]]);
  return isGk
    ? [[t('g_goalkeeping'), pick(ATTR_GROUPS_GK[0][1])],
       [t('g_mental'), pick(ATTR_GROUPS_GK[1][1])],
       [t('g_physical'), pick(ATTR_GROUPS_GK[2][1])]]
    : [[t('g_technical'), pick([...ATTR_GROUPS_OUTFIELD[0][1], ...ATTR_GROUPS_OUTFIELD[3][1]])],
       [t('g_mental'), pick(ATTR_GROUPS_OUTFIELD[1][1])],
       [t('g_physical'), pick(ATTR_GROUPS_OUTFIELD[2][1])]];
}

// Bouwt het kaartmodel uit een echte speler (alle afgeleide waardes en labels).
function buildCardModel(p) {
  const L = CARDL[state.lang] || CARDL.en;
  const isGk = (p.posArr || []).includes('GK');
  const meta = metaScore(p);
  const ca = p.ca || 0, pa = p.pa || 0;
  const wk = isWonderkid(p);
  const tier = wk ? 'gold' : ca >= 150 ? 'elite' : ca >= 115 ? 'strong' : 'neutral';

  const st = isFree(p) ? { t: L.sFree, c: '#8294a8' }
    : p.notForSale ? { t: L.sNfs, c: '#8294a8' }
    : p.setForRelease ? { t: L.sRel, c: '#e06060' }
    : p.listed ? { t: L.sListed, c: '#e8a13c' }
    : p.loanListed ? { t: L.sLoan, c: '#4aa3ff' }
    : null;

  const wr = p.worldRep || 0;
  const rep = wr >= 6500 ? L.repW : wr >= 4500 ? L.repC : wr >= 2500 ? L.repN : L.repL;
  const ip = p.attrs ? p.attrs.InjuryProneness : 0;
  const injury = ip > 0 ? (ip >= 14 ? { t: L.injH, c: '#e06060' } : ip >= 8 ? { t: L.injM, c: '#e8a13c' } : { t: L.injL, c: '#46c46e' }) : null;

  const ev = estValue(p);
  const fee = feeEstimate(p);
  // Verborgen stats uit → sterren blijven (scout-sterren zijn in FM gewoon zichtbaar),
  // maar rauwe CA/PA-getallen en de vraagprijs (afgeleid van CA) gaan van de kaart.
  const hideNum = state.hideCapa;
  const ask = !hideNum && fee.v > 0 ? `${fmtMoney(fee.v * 0.85)}–${fmtMoney(fee.v * 1.15)}` : '–';
  const roles = bestRoles(p, 2).map(r => [roleName(r.id), r.score]);
  const snapDate = state.meta.gameDate ? fmtDate(state.meta.gameDate) : '';

  return {
    L, tier, wk, gk: isGk, name: (p.name || '?').toUpperCase(),
    club: p.club || L.sFree, division: playerDivisionLabel(p), nation: natsLabel(p) || '',
    positions: (p.posArr || []).slice(0, 3).join(' · ') || '–',
    age: getAge(p), foot: footLabel(p), height: p.height ? p.height + ' cm' : '–',
    ca, pa, hideNum, hexNum: state.hideMeta ? null : meta != null ? fmtMeta(meta) : '–',
    groups: cardGroups(p, isGk), roles,
    value: ev.v > 0 ? (ev.est ? '~' : '') + fmtMoney(ev.v) : '–',
    ask, wage: p.wage > 0 ? fmtWage(p.wage) + ' ' + wageSuf() : '–', contract: fmtDate(p.expires) || '–',
    status: st, rep, injury, snap: 'FM24' + (snapDate ? ' · ' + snapDate : ''),
  };
}

const CARD_TIER = { elite: '#46c46e', strong: '#4aa3ff', neutral: '#aeb9c6', gold: '#f5c518' };
const cardFmc = v => v >= 16 ? '#46c46e' : v >= 11 ? '#e8a13c' : '#aeb9c6';
function cardAlpha(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

function drawPlayerCard(p) {
  const d = buildCardModel(p);
  const cv = document.createElement('canvas');
  cv.width = 1200; cv.height = 1600;
  const x = cv.getContext('2d');
  const W = 600, H = 800, g = 1;
  const P = { bg2: '#1c242f', bd: '#2a3441', tx: '#dbe4ee', mu: '#8294a8', gr: '#46c46e', am: '#e8a13c', gd: '#f5c518' };
  const T = CARD_TIER[d.tier], wk = d.wk;
  const A = cardAlpha, fmc = cardFmc;
  const F = (w, s) => `${w} ${s}px "Segoe UI", system-ui, sans-serif`;
  const ls = v => { try { x.letterSpacing = v; } catch (e) { } };
  const rr = (a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); };
  const hexPath = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
  const cham = (i, c, col, lw) => { x.beginPath(); x.moveTo(i + c, i); x.lineTo(W - i - c, i); x.lineTo(W - i, i + c); x.lineTo(W - i, H - i - c); x.lineTo(W - i - c, H - i); x.lineTo(i + c, H - i); x.lineTo(i, H - i - c); x.lineTo(i, i + c); x.closePath(); x.strokeStyle = col; x.lineWidth = lw; x.stroke(); };
  const fit = (s, maxW, size, min, w) => { x.font = F(w, size); while (size > min && x.measureText(s).width > maxW) { size -= 1; x.font = F(w, size); } return size; };
  const trunc = (s, maxW) => { if (x.measureText(s).width <= maxW) return s; while (s.length > 2 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
  const chipAt = (cx0, y0, text, col) => { x.font = F(800, 10.5); ls('1px'); const w = x.measureText(text).width + 24; rr(cx0, y0, w, 24, 12); x.fillStyle = A(col, .12); x.fill(); x.strokeStyle = A(col, .55); x.lineWidth = 1.25; rr(cx0, y0, w, 24, 12); x.stroke(); x.fillStyle = col; x.textAlign = 'left'; x.fillText(text, cx0 + 12, y0 + 16.5); ls('0px'); return w; };
  // 5-puntster met fractionele vulling (halve sterren, zoals FM-scoutrapporten).
  const starPath = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * .47 : r; const px = cx + Math.cos(a) * rr2, py = cy + Math.sin(a) * rr2; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
  const starRow = (x0, cy, r, step, val, fillCol, fillA) => {
    for (let i = 0; i < 5; i++) {
      const cx0 = x0 + i * step;
      const f = Math.max(0, Math.min(1, val - i));
      const frac = f >= .75 ? 1 : f >= .25 ? .5 : 0;
      starPath(cx0, cy, r); x.fillStyle = A('#0b0f14', .5); x.fill();
      x.strokeStyle = A(fillCol, .45); x.lineWidth = 1.25; x.stroke();
      if (frac > 0) {
        x.save(); starPath(cx0, cy, r); x.clip();
        x.fillStyle = A(fillCol, fillA);
        x.fillRect(cx0 - r, cy - r, 2 * r * frac, 2 * r);
        x.restore();
        starPath(cx0, cy, r); x.strokeStyle = A(fillCol, .9); x.stroke();
      }
    }
  };

  x.setTransform(2, 0, 0, 2, 0, 0);
  x.clearRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  x.save(); rr(0, 0, W, H, 20); x.clip();
  let bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1c242f'); bg.addColorStop(.45, '#151b24'); bg.addColorStop(1, '#0e1218'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  let rg = x.createRadialGradient(300, 180, 0, 300, 180, 420); rg.addColorStop(0, A(T, d.tier === 'neutral' ? .08 : .13)); rg.addColorStop(1, A(T, 0)); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  if (wk) { x.save(); x.translate(300, 400); x.rotate(-.42); x.fillStyle = A(P.gd, .04); x.fillRect(-150, -620, 110, 1240); x.fillStyle = A(P.gd, .03); x.fillRect(10, -620, 34, 1240); x.restore(); }
  let tb = x.createLinearGradient(0, 0, W, 0); tb.addColorStop(0, A(T, 0)); tb.addColorStop(.12, A(T, .95)); tb.addColorStop(.88, A(T, .95)); tb.addColorStop(1, A(T, 0)); x.shadowColor = A(T, .6 * g); x.shadowBlur = 16 * g; x.fillStyle = tb; x.fillRect(0, 0, W, 5); x.shadowBlur = 0;
  cham(12, 18, A(T, .3), 1.25); if (wk) cham(17, 24, A(P.gd, .15), 1);

  // ----- header: identiteit links, bio rechts -----
  x.textAlign = 'left';
  const ns = fit(d.name, 386, 34, 21, 800); x.font = F(800, ns); x.fillStyle = P.tx; ls('-0.5px'); x.fillText(d.name, 28, 66); ls('0px');
  x.font = F(700, 14); x.fillStyle = A(P.tx, .92); x.fillText(trunc(d.club, 386), 28, 92);
  x.font = F(600, 11); x.fillStyle = P.mu; x.fillText(trunc(d.division, 386), 28, 110);
  x.textAlign = 'right';
  x.font = F(800, 19); x.fillStyle = P.tx; x.fillText(d.positions, 572, 52);
  x.font = F(600, 12); x.fillStyle = P.mu; x.fillText(`${d.age} · ${d.foot} · ${d.height}`, 572, 72);
  x.font = F(600, 11); x.fillStyle = A(P.mu, .85); x.fillText(trunc(d.nation, 190), 572, 90);
  if (wk) { x.font = F(800, 10.5); const ww = x.measureText(d.L.wk).width + 24; chipAt(572 - ww, 100, d.L.wk, P.gd); }

  // ----- sterrenpaneel: scout-sterren (huidig/potentieel) + meta-hexchip -----
  rr(24, 132, 552, 86, 12); x.fillStyle = A(P.bg2, .5); x.fill(); x.strokeStyle = A(P.bd, .7); x.lineWidth = 1; rr(24, 132, 552, 86, 12); x.stroke();
  const srLab = (tt, y) => { x.font = F(700, 9); ls('1.5px'); x.fillStyle = P.mu; x.textAlign = 'left'; x.fillText(tt, 42, y); ls('0px'); };
  srLab(d.L.cur, 164); srLab(d.L.pot, 199);
  starRow(146, 160, 12, 29, d.ca / 40, P.gd, .95);
  starRow(146, 195, 12, 29, d.pa / 40, P.gd, .45);
  if (!d.hideNum) {
    x.textAlign = 'left';
    x.font = F(800, 17); x.fillStyle = T; x.fillText(String(d.ca), 292, 166); let cw = x.measureText(String(d.ca)).width;
    x.font = F(700, 10); x.fillStyle = P.mu; x.fillText('CA', 292 + cw + 5, 166);
    x.font = F(800, 17); x.fillStyle = wk ? P.gd : P.tx; x.fillText(String(d.pa), 292, 201); cw = x.measureText(String(d.pa)).width;
    x.font = F(700, 10); x.fillStyle = P.mu; x.fillText('PA', 292 + cw + 5, 201);
  }
  // meta-hexchip (FMSS-handtekening); vervalt als de meta-toggle uit staat
  if (d.hexNum !== null) {
    hexPath(512, 175, 33); x.fillStyle = P.bg2; x.shadowColor = A(T, .5 * g); x.shadowBlur = 14 * g; x.fill(); x.shadowBlur = 0; x.strokeStyle = A(T, .9); x.lineWidth = 1.5; x.stroke();
    hexPath(512, 175, 27); x.strokeStyle = A(T, .22); x.lineWidth = 1; x.stroke();
    x.textAlign = 'center'; x.fillStyle = T; x.font = F(800, 20); x.fillText(d.hexNum, 512, 181);
    x.font = F(700, 7.5); x.fillStyle = P.mu; ls('1.5px'); x.fillText(d.L.meta, 512, 195); ls('0px');
  }

  // ----- attributengrid: 3 kolommen in FM-kleuren, zebra-rijen, chips voor 16+ -----
  const cols = [24, 216, 408], colW = 168, rowH = 20, rowY0 = 280;
  const gridHead = (tt, x0, y0) => {
    x.font = F(800, 10); ls('1.5px'); x.fillStyle = P.mu; x.textAlign = 'left'; x.fillText(tt.toUpperCase(), x0, y0); ls('0px');
    rr(x0, y0 + 8, colW, 2, 1); x.fillStyle = A(T, .5); x.fill();
  };
  d.groups.forEach((grp, gi) => {
    const x0 = cols[gi];
    gridHead(grp[0], x0, 250);
    grp[1].forEach(([nm, v], idx) => {
      const ry = rowY0 + idx * rowH;
      if (idx % 2 === 0) { rr(x0 - 6, ry - 14, colW + 12, 19, 4); x.fillStyle = A('#0b0f14', .35); x.fill(); }
      // lange NL-labels ("Beheersing strafschopgebied") krimpen eerst, afkappen is laatste redmiddel
      x.textAlign = 'left'; const lsz = fit(nm, colW - 36, 10.5, 8.5, 600); x.font = F(600, lsz); x.fillStyle = A(P.tx, .72); x.fillText(trunc(nm, colW - 36), x0, ry);
      const vx = x0 + colW;
      if (v >= 16) {
        rr(vx - 28, ry - 13.5, 31, 18, 5); x.fillStyle = A(P.gr, v >= 18 ? .3 : .17); x.fill();
        if (v >= 18) { x.strokeStyle = A(P.gr, .5); x.lineWidth = 1; rr(vx - 28, ry - 13.5, 31, 18, 5); x.stroke(); }
        x.textAlign = 'right'; x.font = F(800, 12.5); x.fillStyle = v >= 18 ? '#7ee2a0' : P.gr; x.fillText(String(v), vx - 5, ry);
      } else {
        x.textAlign = 'right'; x.font = F(v >= 11 ? 700 : 600, 12); x.fillStyle = v >= 11 ? P.am : A(P.mu, .95); x.fillText(String(v), vx - 5, ry);
      }
    });
  });

  // ----- beste rollen: onder Fysiek in kolom 3 -----
  const rx = cols[2], physRows = d.groups[2][1].length;
  const rolesY = rowY0 + physRows * rowH + 18;
  gridHead(d.L.roles, rx, rolesY);
  d.roles.forEach((r, i) => { const yy = rolesY + 32 + i * 38;
    x.textAlign = 'left'; const rsz = fit(r[0], colW - 38, 11.5, 9, 700); x.font = F(700, rsz); x.fillStyle = P.tx; x.fillText(trunc(r[0], colW - 38), rx, yy);
    x.textAlign = 'right'; x.font = F(800, 13); x.fillStyle = fmc(r[1]); x.fillText(r[1].toFixed(1), rx + colW, yy);
    rr(rx, yy + 7, colW, 4, 2); x.fillStyle = A(P.bd, .8); x.fill();
    rr(rx, yy + 7, colW * Math.min(20, r[1]) / 20, 4, 2); x.fillStyle = fmc(r[1]); x.fill(); });

  // ----- financiën + status/reputatie/blessures -----
  rr(24, 564, 552, 104, 12); x.fillStyle = A(P.bg2, .35); x.fill(); x.strokeStyle = A(P.bd, .7); x.lineWidth = 1; rr(24, 564, 552, 104, 12); x.stroke();
  const fx = [44, 180, 316, 452], flab = [d.L.value, d.L.ask, d.L.wage, d.L.contract], fval = [d.value, d.ask, d.wage, d.contract];
  x.textAlign = 'left'; flab.forEach((l, i) => { x.font = F(700, 9.5); ls('1.5px'); x.fillStyle = P.mu; x.fillText(l, fx[i], 590); ls('0px');
    const vs = fit(fval[i], 126, i === 0 ? 18 : 15, 11, 800); x.font = F(800, vs); x.fillStyle = i === 0 ? T : P.tx; x.fillText(fval[i], fx[i], 616); });
  x.strokeStyle = A(P.bd, .5); x.beginPath(); x.moveTo(44, 632); x.lineTo(556, 632); x.stroke();
  x.font = F(600, 11.5); x.fillStyle = P.mu; x.textAlign = 'left'; x.fillText(d.L.rep + ' · ' + d.rep, 44, 654);
  if (d.status) { x.font = F(800, 10.5); const sw = x.measureText(d.status.t).width + 24; chipAt(300 - sw / 2, 636, d.status.t, d.status.c); }
  if (d.injury) { x.font = F(700, 11.5); const iw = x.measureText(d.injury.t).width; x.fillStyle = d.injury.c; x.textAlign = 'right'; x.fillText(d.injury.t, 556, 654);
    x.font = F(600, 11.5); x.fillStyle = P.mu; x.fillText(d.L.inj + ' ·', 556 - iw - 6, 654); }

  // ----- footer -----
  x.strokeStyle = A(P.bd, .7); x.beginPath(); x.moveTo(40, 700); x.lineTo(560, 700); x.stroke();
  x.textAlign = 'left'; x.font = F(600, 12); x.fillStyle = P.mu; x.fillText(d.snap, 40, 738);
  x.font = F(800, 19); const w1 = x.measureText('FM').width, w2 = x.measureText('Super').width, w3 = x.measureText('Scout').width;
  let sx = 562 - (w1 + w2 + w3);
  hexPath(sx - 16, 733, 7); x.fillStyle = A(T, .9); x.fill();
  x.fillStyle = P.tx; x.fillText('FM', sx, 739); x.fillStyle = P.gr; x.fillText('Super', sx + w1, 739); x.fillStyle = P.tx; x.fillText('Scout', sx + w1 + w2, 739);
  x.restore();

  // borders
  x.strokeStyle = A(T, .95); x.lineWidth = 2.5; x.shadowColor = A(T, .55 * g); x.shadowBlur = 18 * g; rr(1.5, 1.5, 597, 797, 19); x.stroke(); x.shadowBlur = 0;
  x.strokeStyle = A(P.bd, .9); x.lineWidth = 1; rr(6.5, 6.5, 587, 787, 15); x.stroke();
  return cv;
}

function downloadPlayerCard(p) {
  try {
    drawPlayerCard(p).toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `fmss-${(p.name || 'player').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
    showToast(t('cardSaved'), 'check');
    bumpStat('fmss_cards');   // teller voor het seizoensrapport
    coffeeGlow();             // net iets opgeleverd: zacht waardemoment
  } catch { showToast('!'); }
}

// ---------- app-stijl helptooltip ----------
// Elk element met data-help="<i18n-key>" krijgt bij hover een tooltip in de app-stijl
// (i.p.v. de kale Windows-title-popup). De tekst wordt op het moment van tonen uit de
// actieve taal gehaald, dus taalwissels werken vanzelf. Met data-tip="<letterlijke tekst>"
// kan hetzelfde voor al samengestelde tekst, zoals de meetpunten in de ontwikkelgrafiek.
function initHelpTip() {
  const tip = document.createElement('div');
  tip.id = 'help-tip'; tip.className = 'hidden';
  document.body.appendChild(tip);
  let cur = null, timer = 0, warmUntil = 0;
  const hide = () => { cur = null; clearTimeout(timer); tip.classList.add('hidden'); };
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-help],[data-tip]');
    if (el === cur) return;
    clearTimeout(timer);
    const wasVisible = !tip.classList.contains('hidden');
    if (!el) {
      // Net een tip verlaten: korte "warme" periode waarin de volgende meteen toont,
      // zoals OS-menu's. Daarbuiten geldt de vertraging weer.
      if (wasVisible) warmUntil = Date.now() + 400;
      hide(); return;
    }
    cur = el;
    const show = () => {
      tip.textContent = el.dataset.tip ?? t(el.dataset.help);
      tip.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      tip.style.left = '0px'; tip.style.top = '0px';               // eerst meten op (0,0)
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let xPos = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
      let yPos = r.bottom + 8;
      if (yPos + th > window.innerHeight - 8) yPos = r.top - th - 8;
      tip.style.left = xPos + 'px'; tip.style.top = yPos + 'px';
    };
    // Vertraging voorkomt flikkerende tips terwijl je met de muis over de tabel beweegt
    // (elke naamcel heeft er een). Direct doorschuiven van tip naar tip blijft instant.
    if (wasVisible || Date.now() < warmUntil) show();
    else timer = setTimeout(show, 450);
  });
  document.addEventListener('scroll', hide, true);
}
initHelpTip();

// ---------- update-melding ----------
// Checkt hooguit 1x per ~20 uur de laatste GitHub-release (API staat CORS toe) en toont
// een wegklikbaar pilletje in de topbar bij een nieuwere versie. Offline/fout = stil.
// Met force=true (knop in Instellingen): cache en eerdere wegklik negeren, en het
// resultaat teruggeven zodat de knop "up-to-date"/"update gevonden" kan tonen;
// een fout bubbelt dan op naar de knop i.p.v. stil te blijven.
async function checkUpdate(force = false) {
  try {
    let chk = {};
    try { chk = JSON.parse(localStorage.getItem('fmss_updchk') || '{}'); } catch { }
    if (force || !chk.at || Date.now() - chk.at > 20 * 3600e3) {
      // De server zoekt alleen releases met het unieke FMSuperScout24-installatiebestand.
      // Zo krijgt deze editie nooit een update van de oorspronkelijke app aangeboden.
      const res = await fetch('/api/version-check');
      if (!res.ok) throw new Error('Geen FMSuperScout 24-update gevonden');
      const tag = (await res.json()).tag;
      if (!tag) return { newer: false, tag: null };
      chk = { at: Date.now(), tag };
      localStorage.setItem('fmss_updchk', JSON.stringify(chk));
    }
    if (!chk.tag) return { newer: false, tag: null };
    const norm = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
    const [l, c] = [norm(chk.tag), norm(APP_VERSION)];
    const newer = l[0] !== c[0] ? l[0] > c[0] : l[1] !== c[1] ? l[1] > c[1] : (l[2] || 0) > (c[2] || 0);
    if (force) localStorage.removeItem('fmss_upd_dismiss');   // handmatige check heropent de melding bewust
    if (!newer || localStorage.getItem('fmss_upd_dismiss') === chk.tag) return { newer, tag: chk.tag };
    const el = $('update-pill');
    el.innerHTML = `<a href="${REPO_URL}/releases/tag/${encodeURIComponent(chk.tag)}" target="_blank" rel="noopener">${tf('updateAvail', { v: chk.tag })}</a>
      <button title="${t('donateLater')}">${icon('x', 10)}</button>`;
    el.classList.remove('hidden');
    // Klik = downloaden + installer starten (server verifieert de SHA-256). Faalt het,
    // dan valt de pill terug op de gewone link naar de releasepagina.
    el.querySelector('a').onclick = e => { e.preventDefault(); startSelfUpdate(el); };
    el.querySelector('button').onclick = () => { localStorage.setItem('fmss_upd_dismiss', chk.tag); el.classList.add('hidden'); };
    return { newer, tag: chk.tag };
  } catch (e) {
    if (force) throw e;   // knop toont de foutmelding; de stille autocheck blijft stil
  }
}

// Zelf-update: server downloadt en verifieert de nieuwe Setup.exe en start hem; wij
// tonen alleen de voortgang in de pill. Als de server stopt ('launching' gezien of
// verbinding weg), is de installer bezig en tonen we de slottekst.
async function startSelfUpdate(el) {
  const setTxt = (txt, cls = '') => { el.innerHTML = `<span class="${cls}">${escHtml(txt)}</span>`; };
  try {
    setTxt(tf('updDl', { pct: 0 }));
    await fetch('/api/update-install', { method: 'POST' });
    for (; ;) {
      await new Promise(r => setTimeout(r, 500));
      let st;
      try { st = await (await fetch('/api/update-status')).json(); }
      catch { break; }   // server al gestopt voor de installer
      if (st.phase === 'downloading') setTxt(tf('updDl', { pct: st.pct || 0 }));
      else if (st.phase === 'verifying') setTxt(t('updVerify'));
      else if (st.phase === 'launching') break;
      else if (st.phase === 'error') {
        el.innerHTML = `<a href="${REPO_URL}/releases/latest" target="_blank" rel="noopener">${escHtml(t('updErr'))}</a>`;
        console.error('update:', st.error);
        return;
      }
    }
    setTxt(t('updLaunch'));
  } catch {
    el.innerHTML = `<a href="${REPO_URL}/releases/latest" target="_blank" rel="noopener">${escHtml(t('updErr'))}</a>`;
  }
}

// ---------- probleem melden ----------
// Opent een voorgevuld GitHub-issue met de omgevingsinfo die we hebben; de gebruiker
// hoeft alleen het verhaal en de diagnostiekbestanden toe te voegen.
async function reportBug() {
  // Kop van diagnostics.txt (t/m de eerste lege regel) automatisch meesturen: leesbron
  // (live/snapshot), geheugenstatus en fase-timing — precies de telemetrie waarmee
  // veldproblemen te herleiden zijn, en het bestand zelf wordt vaak vergeten.
  let diag = [];
  try {
    const r = await fetch('/api/diagnostics');
    if (r.ok) {
      const head = (await r.text()).split(/\r?\n/).slice(0, 12);
      const cut = head.findIndex(l => !l.trim());
      diag = ['', '### Last scan telemetry (auto-filled from diagnostics.txt)', '```',
              ...(cut < 0 ? head : head.slice(0, cut)), '```'];
    }
  } catch { /* geen server of geen diagnostics: sectie gewoon weglaten */ }
  const m = state.meta || {};
  const body = [
    '### What happened?', '', '_Describe the problem here._', '',
    '### Environment (auto-filled)',
    `- FMSuperScout 24 app: v${APP_VERSION}`,
    `- Reader: ${m.pluginVersion || 'unknown (no dump loaded)'}`,
    `- FM game version: ${m.gameVersion || 'unknown'} (supported: ${m.supportedVersion || '?'}, ok: ${m.versionOk ?? '?'})`,
    `- Players/staff loaded: ${state.players.length} / ${state.staff.length}`,
    ...(lastStatus && lastStatus.dumpSize
      ? [`- Dump on disk: ${(lastStatus.dumpSize / 1048576).toFixed(0)} MB (${lastStatus.dumpFile || 'dump.json'})`] : []),
    ...(loadError ? [`- Load error: ${loadError.msg}`] : []),
    `- Platform: Steam / Epic / Game Pass? _(fill in)_`,
    ...diag,
    '',
    '### Attach these files (important!)',
    'From `%LOCALAPPDATA%\\FMSuperScout24\\`: `diagnostics.txt` and `status.json`.',
    'Reader diagnostics are in `%LOCALAPPDATA%\\FMSuperScout24\\diagnostics.txt`.',
  ].join('\n');
  window.open(`${REPO_URL}/issues/new?title=${encodeURIComponent('[bug] ')}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
}

// ---------- steun (Ko-fi): één seizoensrapport per voetbalseizoen ----------
// Eén moment, en het juiste: rolt het in-game seizoen over 1 juli heen, dan verschijnt
// één wegklikbaar kaartje met wat de tool dat seizoen voor je deed, en daaronder de
// vraag. Niet vaker, niet minder vaak. "Al gedoneerd?" of "Vraag het niet meer" maakt
// het permanent stil; donateurs krijgen een goudkleurig koffie-icoon als bedankje.
const KOFI = 'https://ko-fi.com/fmsuperscout';
function openKofi() { window.open(KOFI, '_blank', 'noopener'); }
const kofiOff = () => localStorage.getItem('fmss_kofi_off') === '1';
// Gebruikstellers voor het rapport; de baseline wordt bij elk rapport verschoven zodat
// de cijfers per seizoen zijn, niet cumulatief.
function bumpStat(k) { try { localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + 1)); } catch { } }

// Seizoensjaar: 1 juli is de grens, zoals in het echte voetbal. 10-07-2029 → seizoen
// 2029/30 is net begonnen. Zonder exacte datum valt het terug op het afgeleide
// seizoensjaar uit de dump (zelfde grens, want dat ís een seizoensjaar).
function seasonYearOf() {
  const ds = state.meta.gameDate;
  if (ds) { const d = parseGameDate(ds); if (!isNaN(d)) return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }
  return state.meta.gameYear || 0;
}
function maybeSeasonReport() {
  if (kofiOff()) return;
  const y = seasonYearOf(); if (!y) return;
  const prev = +localStorage.getItem('fmss_season') || 0;
  if (!prev || y < prev) {   // allereerste dump, of een oudere save geladen: ijken, niet vragen
    localStorage.setItem('fmss_season', String(y));
    return;
  }
  if (y === prev) return;
  localStorage.setItem('fmss_season', String(y));
  // Vangnet voor save-wissels: wie tussen twee careers in verschillende jaren springt,
  // krijgt niet bij elke wissel een rapport. Het seizoensijkpunt schuift wel gewoon mee.
  const lastAt = +localStorage.getItem('fmss_season_at') || 0;
  if (Date.now() - lastAt < 7 * 864e5) return;
  localStorage.setItem('fmss_season_at', String(Date.now()));

  let base; try { base = JSON.parse(localStorage.getItem('fmss_season_base') || '{}'); } catch { base = {}; }
  const cur = { uses: +localStorage.getItem('fmss_uses') || 0, loads: +localStorage.getItem('fmss_loads') || 0, cards: +localStorage.getItem('fmss_cards') || 0 };
  try { localStorage.setItem('fmss_season_base', JSON.stringify(cur)); } catch { }
  const n = k => Math.max(0, cur[k] - (+base[k] || 0));
  const stats = [];
  if (n('uses') > 0) stats.push(tf('seasonStatProfiles', { n: n('uses').toLocaleString(uiLocale()) }));
  if (n('loads') > 0) stats.push(tf('seasonStatLoads', { n: n('loads') }));
  if (n('cards') > 0) stats.push(tf('seasonStatCards', { n: n('cards') }));
  if (state.shortlist.size > 0) stats.push(tf('seasonStatShort', { n: state.shortlist.size }));

  const season = `${y - 1}/${String(y).slice(2)}`;
  // Bewuste asymmetrie: het eerste rapport heeft geen permanente uitknop (wegklikken kan
  // altijd via kruisje of Later); "Vraag het niet meer" verschijnt vanaf het tweede
  // rapport, klein en zonder onderstreping. "Al gedoneerd?" is er wel meteen.
  const shown = +localStorage.getItem('fmss_season_n') || 0;
  localStorage.setItem('fmss_season_n', String(shown + 1));
  const el = $('donate-nudge');
  el.innerHTML = `<button class="dn-x" title="${t('donateLater')}">${icon('x', 12)}</button>
    <div class="dn-title">${icon('ball', 15)} ${escHtml(tf('seasonTitle', { s: season }))}</div>
    ${stats.length ? `<div class="dn-stats">${stats.join(' · ')}</div>` : ''}
    <div class="dn-text">${t('seasonAsk')}</div>
    <div class="dn-actions"><a class="dn-cta" href="${KOFI}" target="_blank" rel="noopener">${t('donateCta')}</a>
      <button class="dn-later">${t('donateLater')}</button></div>
    <div class="dn-links"><button class="dn-donated">${t('alreadyDonated')}</button>${shown >= 1 ? `<button class="dn-never">${t('neverAsk')}</button>` : ''}</div>`;
  el.classList.remove('hidden');
  const close = () => el.classList.add('hidden');
  el.querySelector('.dn-cta').onclick = close;
  el.querySelector('.dn-later').onclick = close;
  el.querySelector('.dn-x').onclick = close;
  el.querySelector('.dn-donated').onclick = () => {
    localStorage.setItem('fmss_kofi_off', '1'); localStorage.setItem('fmss_supporter', '1');
    $('btn-coffee').classList.add('supporter');
    showToast(t('supporterThanks'), 'check'); close();
  };
  const nv = el.querySelector('.dn-never');
  if (nv) nv.onclick = () => { localStorage.setItem('fmss_kofi_off', '1'); close(); };
}

// ---------- spelervergelijking ----------
const findPlayer = id => state.players.find(p => p.id === id) || state.staff.find(p => p.id === id);
function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else { if (state.compare.length >= 3) { showToast(t('compareFull')); return; } state.compare.push(id); }
  renderCompareTray();
}
function renderCompareTray() {
  const tray = $('compare-tray');
  if (!state.compare.length) { tray.classList.add('hidden'); return; }
  tray.classList.remove('hidden');
  const chips = state.compare.map(id => {
    const p = findPlayer(id);
    return `<span class="ct-chip" data-id="${id}">${p ? escHtml(p.name) : '?'}<span class="x" data-rm="${id}">${icon('x', 10)}</span></span>`;
  }).join('');
  tray.innerHTML = `<div class="ct-label">${t('comparing')}</div>${chips}` +
    `<button class="ct-go" ${state.compare.length < 2 ? 'disabled' : ''}>${t('compare')} (${state.compare.length})</button>` +
    `<button class="ct-clear" title="${t('clear')}">${icon('x', 13)}</button>`;
  tray.querySelectorAll('[data-rm]').forEach(x => x.onclick = e => { e.stopPropagation(); toggleCompare(+x.dataset.rm); });
  tray.querySelectorAll('.ct-chip').forEach(c => c.onclick = () => { const p = findPlayer(+c.dataset.id); if (p) showDetail(p); });
  tray.querySelector('.ct-go').onclick = openCompare;
  tray.querySelector('.ct-clear').onclick = () => { state.compare = []; renderCompareTray(); };
}
function bestRoleScore(p) {
  const b = bestRoles(p, 1)[0];
  return b ? { name: roleName(b.id), score: b.score } : null;
}
function openCompare() {
  const players = state.compare.map(findPlayer).filter(Boolean);
  if (players.length < 2) return;
  const n = players.length;
  const two = n === 2;   // bij precies 2 spelers is er een Δ-kolom; bij 3 markeert de rij de winnaar

  // Beste/slechtste per rij (hi=false: laag is beter; hi=null: neutraal, geen markering).
  const marksOf = (vals, hi) => {
    const nums = vals.filter(v => v != null);
    if (hi == null || nums.length < 2) return vals.map(() => '');
    const best = hi ? Math.max(...nums) : Math.min(...nums);
    const worst = hi ? Math.min(...nums) : Math.max(...nums);
    if (best === worst) return vals.map(() => '');
    return vals.map(v => v == null ? '' : v === best ? 'cmp-best' : v === worst ? 'cmp-worst' : '');
  };
  // Δ-cel (alleen bij 2 spelers): speler 1 − speler 2, groen als speler 1 beter af is.
  const deltaCell = (vals, hi, fmtAbs) => {
    if (!two) return '';
    const [a, b] = vals;
    if (a == null || b == null) return '<div class="cmp-cell cmp-delta"><span class="dim">·</span></div>';
    const d = a - b;
    const cls = d === 0 || hi == null ? 'cmp-dzero' : (d > 0) === (hi !== false) ? 'cmp-dpos' : 'cmp-dneg';
    const txt = d === 0 ? '=' : (d > 0 ? '+' : '−') + fmtAbs(Math.abs(d));
    return `<div class="cmp-cell cmp-delta"><span class="${cls}">${txt}</span></div>`;
  };
  // Generieke rij. opts: hi (true/false/null), fmt, dec (decimalen), attr (FM-kleur),
  // invert (hoog=slecht → omgekeerde kleur, bv. blessuregevoeligheid).
  const row = (label, vals, opts = {}) => {
    const hi = 'hi' in opts ? opts.hi : true;
    const fmtV = opts.fmt || (v => opts.dec ? v.toFixed(opts.dec) : String(v));
    const marks = marksOf(vals, hi);
    const cells = vals.map((v, i) => {
      if (v == null) return '<div class="cmp-cell"><span class="dim">·</span></div>';
      const color = opts.attr ? ' ' + (opts.invert ? attrClass(21 - v) : attrClass(v)) : '';
      return `<div class="cmp-cell"><span class="v${color} ${marks[i]}">${fmtV(v)}</span></div>`;
    }).join('');
    return `<div class="cmp-row"><div class="cmp-lbl">${label}</div>${cells}${deltaCell(vals, hi, fmtV)}</div>`;
  };
  const textRow = (label, vals) => `<div class="cmp-row"><div class="cmp-lbl">${label}</div>` +
    vals.map(v => `<div class="cmp-cell">${v ? escHtml(v) : '<span class="dim">·</span>'}</div>`).join('') +
    (two ? '<div class="cmp-cell cmp-delta"></div>' : '') + '</div>';

  // ----- winsttelling (voor het kop-badge): bij hoeveel attributen uniek de beste? -----
  const isGk = players.every(p => (p.posArr || []).includes('GK'));
  const groups = isGk ? ATTR_GROUPS_GK : ATTR_GROUPS_OUTFIELD;
  const wins = players.map(() => 0);
  for (const [, keys] of groups)
    for (const k of keys) {
      const vals = players.map(p => p.attrs ? p.attrs[k] : null);
      const nums = vals.filter(v => v != null);
      if (nums.length < 2) continue;
      const best = Math.max(...nums);
      const idx = vals.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
      if (idx.length === 1 && best !== Math.min(...nums)) wins[idx[0]]++;
    }

  // ----- kop: eigen sticky grid boven de hele scroll (namen + stamdata altijd zichtbaar) -----
  const headRow = `<div class="cmp-row cmp-head"><div class="cmp-lbl"></div>` +
    players.map((p, i) => {
      const ev = estValue(p);
      const val = ev.v > 0 ? fmtMoney(ev.v) : null;
      const bits = [val, p.wage > 0 ? fmtWage(p.wage) + ' ' + wageSuf() : null,
        p.expires ? String(p.expires).slice(0, 4) : null].filter(Boolean).join(' · ');
      return `<div class="cmp-cell"><div class="cmp-name">${escHtml(p.name)}</div>` +
        `<div class="cmp-meta">${getAge(p)} · ${escHtml(p.pos || jobLabel(p))} · ${p.club ? escHtml(p.club) : '–'}` +
        `${bits ? `<br>${bits}` : ''}` +
        `${p.attrs ? `<br><span class="cmp-winsb">${tf('cmpWinsBadge', { n: wins[i] })}</span>` : ''}</div></div>`;
    }).join('') +
    (two ? `<div class="cmp-cell cmp-delta" data-help="cmpDeltaHint">Δ</div>` : '') + '</div>';

  // ----- kerngetallen -----
  let body = '';
  if (!state.hideCapa) {
    body += row('CA', players.map(p => p.ca));
    body += row('PA', players.map(p => p.pa));
  }
  if (!state.hideMeta) body += row(t('c_meta'), players.map(p => metaScore(p)), { fmt: v => v.toFixed(2) });
  if (!state.hideMeta && !state.hideCapa) body += row(t('c_metapa'), players.map(p => metaPaScore(p)), { fmt: v => v.toFixed(2) });
  body += row(t('cmpValue'), players.map(p => estValue(p).v), { fmt: fmtMoney, hi: null });
  if (!state.hideCapa)
    body += row(t('c_fee'), players.map(p => { const f = feeEstimate(p); return f.v > 0 ? f.v : null; }), { fmt: fmtMoney, hi: false });
  body += row(t('wageLabel') + ' ' + wageSuf(), players.map(p => p.wage), { fmt: fmtWage, hi: false });
  body += row(t('c_age'), players.map(p => getAge(p)), { hi: false });
  body += row(t('height'), players.map(p => p.height || null), { fmt: v => v + ' cm', hi: null });
  body += textRow(t('contractLabel'), players.map(p => fmtDate(p.expires)));
  body += textRow(t('foot'), players.map(p => footLabel(p)));
  const roles = players.map(bestRoleScore);
  body += `<div class="cmp-row"><div class="cmp-lbl">${t('cmpTopRole')}</div>` +
    roles.map(r => `<div class="cmp-cell">${r ? `${r.name}<br><b class="${roleClass(r.score)}">${r.score.toFixed(1)}</b>` : '<span class="dim">·</span>'}</div>`).join('') +
    (two ? '<div class="cmp-cell cmp-delta"></div>' : '') + '</div>';

  // ----- attributen: twee kolommen met panelen, rijen in FM-stijl -----
  // Bij 2 spelers per rij: naam | waarde1 | vergelijkbalkje | waarde2 (zoals FM zelf):
  // het balkje wijst met kleur en lengte naar wie beter is (groen = speler 1, blauw =
  // speler 2), lengte ∝ het verschil. Bij 3 spelers: naam | w1 w2 w3 met winnaar-markering.
  const cmpBar = (a, b, hi, dec) => {
    if (a == null || b == null || hi == null)
      return '<span class="cbar"><i class="cb-tick"></i></span>';
    const d = a - b;
    const p1beter = (d > 0) === (hi !== false);
    const pct = Math.min(100, Math.round(Math.abs(d) / 8 * 100));   // 8 punten verschil = vol
    const dTxt = d === 0 ? '=' : (d > 0 ? '+' : '−') + (dec ? Math.abs(d).toFixed(dec) : Math.abs(d));
    return `<span class="cbar" data-tip="Δ ${escHtml(dTxt)}"><i class="cb-tick"></i>` +
      (d === 0 ? '' : `<i class="${p1beter ? 'cb-l' : 'cb-r'}" style="width:${Math.max(6, pct / 2)}%"></i>`) + '</span>';
  };
  const attrPanelRow = (label, vals, opts = {}) => {
    const hi = 'hi' in opts ? opts.hi : true;
    const marks = marksOf(vals, hi);
    const fmtV = v => opts.dec ? v.toFixed(opts.dec) : String(v);
    const cellV = (v, i) => v == null ? '<span class="cpv dim">·</span>' :
      `<span class="cpv v ${opts.invert ? attrClass(21 - v) : attrClass(v)} ${marks[i]}">${fmtV(v)}</span>`;
    if (two)
      return `<div class="cpr${opts.foot ? ' cpr-foot' : ''}"><span class="cpl">${label}</span>${cellV(vals[0], 0)}${cmpBar(vals[0], vals[1], hi, opts.dec)}${cellV(vals[1], 1)}</div>`;
    return `<div class="cpr cpr3${opts.foot ? ' cpr-foot' : ''}"><span class="cpl">${label}</span>${vals.map((v, i) => cellV(v, i)).join('')}</div>`;
  };
  const panel = (title, rowsHtml) => rowsHtml ? `<div class="cmpg"><h3>${title}</h3>${rowsHtml}</div>` : '';
  const buildGroup = (gkey, keys) => {
    const present = sortByLabel(keys || []).filter(k => players.some(p => p.attrs && p.attrs[k] != null));
    if (!present.length) return '';
    let rows = present.map(k =>
      attrPanelRow(attrName(k), players.map(p => p.attrs ? p.attrs[k] : null))).join('');
    // FM-stijl voetregel: groepsgemiddelde met eigen vergelijkbalkje.
    if (present.length >= 3) {
      const avgs = players.map(p => {
        const vs = present.map(k => p.attrs ? p.attrs[k] : null).filter(v => v != null);
        return vs.length ? Math.round(10 * vs.reduce((s, v) => s + v, 0) / vs.length) / 10 : null;
      });
      rows += attrPanelRow(t('avgLabel'), avgs, { dec: 1, foot: true });
    }
    return panel(t(gkey), rows);
  };

  let panels = '';
  if (players.some(p => p.attrs)) {
    const gmap = Object.fromEntries(groups.map(([k, keys]) => [k, keys]));
    // Verborgen kenmerken + persoonlijkheid (zelfde zichtbaarheidsregel als het detailpaneel).
    let hidPanel = '', persPanel = '';
    if (!state.hideCapa) {
      const hid = [['Consistency', true], ['ImportantMatches', true], ['Versatility', true],
        ['InjuryProneness', false], ['Dirtiness', false]]
        .filter(([k]) => players.some(p => p.attrs && p.attrs[k] > 0));
      hidPanel = panel(t('hiddenTitle'), hid.map(([k, good]) =>
        attrPanelRow(t('a_' + k), players.map(p => p.attrs && p.attrs[k] > 0 ? p.attrs[k] : null),
          { hi: good, invert: !good })).join(''));
      const pers = [['ambition', true], ['professionalism', true], ['loyalty', null], ['pressure', true],
        ['temperament', true], ['sportsmanship', null], ['adaptability', true], ['controversy', false]]
        .filter(([k]) => players.some(p => p[k] > 0));
      persPanel = panel(t('personaTitle'), pers.map(([k, dir]) =>
        attrPanelRow(t(k), players.map(p => p[k] > 0 ? p[k] : null),
          { hi: dir, invert: dir === false })).join(''));
    }
    // Links de "lange" groepen (technisch/keepen + fysiek), rechts mentaal + standaard;
    // verborgen links en persoonlijkheid rechts houdt beide kolommen in balans.
    const leftStack = buildGroup(isGk ? 'g_goalkeeping' : 'g_technical', gmap[isGk ? 'g_goalkeeping' : 'g_technical'])
      + buildGroup('g_physical', gmap.g_physical) + hidPanel;
    const rightStack = buildGroup('g_mental', gmap.g_mental)
      + buildGroup('g_setpieces', gmap.g_setpieces) + persPanel;
    if (leftStack || rightStack)
      panels = `<div class="cmp-panels"><div>${leftStack}</div><div>${rightStack}</div></div>`;
  }

  const cols = two ? '130px 1fr 1fr 72px' : `130px repeat(${n}, 1fr)`;
  $('compare-inner').innerHTML =
    `<div class="cmp-top"><h2>${t('cmpTitle')}</h2><button id="cmp-close">${icon('x', 15)}</button></div>` +
    `<div class="cmp-scroll">` +
    `<div class="cmp-grid cmp-headgrid" style="grid-template-columns:${cols}">${headRow}</div>` +
    `<div class="cmp-grid" style="grid-template-columns:${cols}">${body}</div>${panels}</div>`;
  $('compare-modal').classList.remove('hidden');
  $('cmp-close').onclick = closeCompare;
}
function closeCompare() { $('compare-modal').classList.add('hidden'); }
$('compare-modal').addEventListener('click', e => { if (e.target.id === 'compare-modal') closeCompare(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('compare-modal').classList.contains('hidden')) closeCompare(); });

// ================= MODULE MEILLEUR XI & TACTIQUE =================
const XI_FORMATIONS = {
  '4-3-3': [
    {role: 'af', line: 'fw', side: 'C', t: 15, l: 50},
    {role: 'wing', line: 'am', side: 'L', t: 25, l: 15},
    {role: 'wing', line: 'am', side: 'R', t: 25, l: 85},
    {role: 'cm', line: 'cm', side: 'CL', t: 45, l: 30},
    {role: 'cm', line: 'cm', side: 'CR', t: 45, l: 70},
    {role: 'dm', line: 'dm', side: 'C', t: 60, l: 50},
    {role: 'fb', line: 'df', side: 'L', t: 75, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'fb', line: 'df', side: 'R', t: 75, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '4-2-3-1': [
    {role: 'af', line: 'fw', side: 'C', t: 15, l: 50},
    {role: 'wing', line: 'am', side: 'L', t: 30, l: 15},
    {role: 'am', line: 'am', side: 'C', t: 30, l: 50},
    {role: 'wing', line: 'am', side: 'R', t: 30, l: 85},
    {role: 'dm', line: 'dm', side: 'CL', t: 55, l: 35},
    {role: 'dm', line: 'dm', side: 'CR', t: 55, l: 65},
    {role: 'fb', line: 'df', side: 'L', t: 75, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'fb', line: 'df', side: 'R', t: 75, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '4-4-2': [
    {role: 'af', line: 'fw', side: 'CL', t: 15, l: 35},
    {role: 'af', line: 'fw', side: 'CR', t: 15, l: 65},
    {role: 'wing', line: 'cm', side: 'L', t: 45, l: 15},
    {role: 'cm', line: 'cm', side: 'CL', t: 45, l: 35},
    {role: 'cm', line: 'cm', side: 'CR', t: 45, l: 65},
    {role: 'wing', line: 'cm', side: 'R', t: 45, l: 85},
    {role: 'fb', line: 'df', side: 'L', t: 75, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'fb', line: 'df', side: 'R', t: 75, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '5-3-2': [
    {role: 'af', line: 'fw', side: 'CL', t: 15, l: 35},
    {role: 'af', line: 'fw', side: 'CR', t: 15, l: 65},
    {role: 'cm', line: 'cm', side: 'CL', t: 45, l: 30},
    {role: 'cm', line: 'cm', side: 'C', t: 45, l: 50},
    {role: 'cm', line: 'cm', side: 'CR', t: 45, l: 70},
    {role: 'wb', line: 'df', side: 'L', t: 65, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'C', t: 75, l: 50},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'wb', line: 'df', side: 'R', t: 65, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '4-2-4': [
    {role: 'af', line: 'fw', side: 'CL', t: 15, l: 35},
    {role: 'af', line: 'fw', side: 'CR', t: 15, l: 65},
    {role: 'wing', line: 'am', side: 'L', t: 30, l: 15},
    {role: 'wing', line: 'am', side: 'R', t: 30, l: 85},
    {role: 'cm', line: 'cm', side: 'CL', t: 50, l: 35},
    {role: 'cm', line: 'cm', side: 'CR', t: 50, l: 65},
    {role: 'fb', line: 'df', side: 'L', t: 75, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'fb', line: 'df', side: 'R', t: 75, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '5-4-1': [
    {role: 'af', line: 'fw', side: 'C', t: 15, l: 50},
    {role: 'wing', line: 'cm', side: 'L', t: 45, l: 15},
    {role: 'cm', line: 'cm', side: 'CL', t: 45, l: 35},
    {role: 'cm', line: 'cm', side: 'CR', t: 45, l: 65},
    {role: 'wing', line: 'cm', side: 'R', t: 45, l: 85},
    {role: 'wb', line: 'df', side: 'L', t: 65, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'C', t: 75, l: 50},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'wb', line: 'df', side: 'R', t: 65, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '4-1-4-1': [
    {role: 'af', line: 'fw', side: 'C', t: 15, l: 50},
    {role: 'wing', line: 'cm', side: 'L', t: 40, l: 15},
    {role: 'cm', line: 'cm', side: 'CL', t: 40, l: 35},
    {role: 'cm', line: 'cm', side: 'CR', t: 40, l: 65},
    {role: 'wing', line: 'cm', side: 'R', t: 40, l: 85},
    {role: 'dm', line: 'dm', side: 'C', t: 55, l: 50},
    {role: 'fb', line: 'df', side: 'L', t: 75, l: 15},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 35},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 65},
    {role: 'fb', line: 'df', side: 'R', t: 75, l: 85},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ],
  '3-4-3': [
    {role: 'af', line: 'fw', side: 'C', t: 15, l: 50},
    {role: 'wing', line: 'am', side: 'L', t: 25, l: 20},
    {role: 'wing', line: 'am', side: 'R', t: 25, l: 80},
    {role: 'cm', line: 'cm', side: 'CL', t: 45, l: 35},
    {role: 'cm', line: 'cm', side: 'CR', t: 45, l: 65},
    {role: 'wb', line: 'dm', side: 'L', t: 55, l: 15},
    {role: 'wb', line: 'dm', side: 'R', t: 55, l: 85},
    {role: 'cd', line: 'df', side: 'CL', t: 75, l: 30},
    {role: 'cd', line: 'df', side: 'C', t: 75, l: 50},
    {role: 'cd', line: 'df', side: 'CR', t: 75, l: 70},
    {role: 'gk', line: 'gk', side: 'C', t: 90, l: 50}
  ]
};

// Maps a Best XI slot to a meta group name, so we use position-specific weights when scoring.
// wing/if disambiguation: cm-line = wide mid (WM), am-line = attacking wing (AM).
function slotMetaGroup(slot) {
  switch (slot.role) {
    case 'gk':                                        return 'GK';
    case 'cd': case 'bpd':                            return 'DC';
    case 'fb': case 'wb':                             return 'FB';
    case 'dm': case 'dlp': case 'bwm':               return 'DM';
    case 'cm': case 'b2b': case 'ap':                return 'MC';
    case 'wing': case 'if':
      return slot.line === 'cm' ? 'WM' : 'AM';
    case 'am':                                        return 'AM';
    case 'af': case 'poacher': case 'tm': case 'cf': return 'ST';
    default: return null;
  }
}

// Returns the specific FM position codes that a slot requires.
// Only positions consistent with the slot's meta group are included, so proficiency
// lookups are always against the right position (AML ≠ AMC even though both are 'AM' group).
function slotFmPositions(slot) {
  const { role, side, line } = slot;
  switch (role) {
    case 'gk':   return ['GK'];
    case 'cd': case 'bpd':  return ['DC'];
    case 'fb':
      // Full-back role → classic DR/DL positions
      if (side === 'L' || side === 'CL') return ['DL'];
      if (side === 'R' || side === 'CR') return ['DR'];
      return ['DL', 'DR'];
    case 'wb':
      // Wing-back role → WBR/WBL positions; DR=20/WBR=7 at a WBR slot uses WBR proficiency
      if (side === 'L' || side === 'CL') return ['WBL'];
      if (side === 'R' || side === 'CR') return ['WBR'];
      return ['WBL', 'WBR'];
    case 'dm': case 'dlp': case 'bwm': return ['DM'];
    case 'cm': case 'b2b': case 'ap':  return ['MC'];
    case 'wing': case 'if':
      // am-line = AM weight table → AML/AMR; cm-line = WM weight table → ML/MR
      if (line === 'am') {
        if (side === 'L' || side === 'CL') return ['AML'];
        if (side === 'R' || side === 'CR') return ['AMR'];
        return ['AML', 'AMR'];
      } else {
        if (side === 'L' || side === 'CL') return ['ML'];
        if (side === 'R' || side === 'CR') return ['MR'];
        return ['ML', 'MR'];
      }
    case 'am':   return ['AMC'];
    case 'af': case 'poacher': case 'tm': case 'cf': return ['ST'];
    default: return [];
  }
}

function canPlaySlot(p, slot) {
  const pos = p.posArr || [];
  if (!pos.length) return false;
  const role = slot.role;
  const side = slot.side;

  if (role === 'gk') return pos.includes('GK');
  if (role === 'cd' || role === 'bpd') return pos.includes('DC');
  if (role === 'fb' || role === 'wb') {
    if (side === 'L' || side === 'CL') return pos.includes('DL') || pos.includes('WBL');
    if (side === 'R' || side === 'CR') return pos.includes('DR') || pos.includes('WBR');
    return pos.includes('DL') || pos.includes('DR') || pos.includes('WBL') || pos.includes('WBR');
  }
  if (role === 'dm' || role === 'dlp' || role === 'bwm') return pos.includes('DM');
  if (role === 'cm' || role === 'b2b' || role === 'ap') return pos.includes('MC');
  if (role === 'wing' || role === 'if') {
    if (side === 'L' || side === 'CL') return pos.includes('AML') || pos.includes('ML');
    if (side === 'R' || side === 'CR') return pos.includes('AMR') || pos.includes('MR');
    return pos.includes('AML') || pos.includes('AMR') || pos.includes('ML') || pos.includes('MR');
  }
  if (role === 'am') return pos.includes('AMC');
  if (role === 'af' || role === 'poacher' || role === 'tm' || role === 'cf') return pos.includes('ST');
  return false;
}

function bestMetaForSlot(p, slot, scores, profThreshold = state.xiProfThreshold) {
  if (!p.attrs || !canPlaySlot(p, slot)) return null;
  const hasProfData = p.posProficiency && Object.keys(p.posProficiency).length > 0;
  const positionScores = scores || metaScoresByPosition(p, p.attrs);
  const best = slotFmPositions(slot)
    .map(pos => positionScores.find(entry => entry.pos === pos))
    .filter(entry => entry && (hasProfData
      ? entry.prof != null && entry.prof >= profThreshold
      : (p.posArr || []).includes(entry.pos)))
    .reduce((currentBest, entry) => !currentBest || entry.effectiveMeta > currentBest.effectiveMeta ? entry : currentBest, null);
  return best && Number.isFinite(best.effectiveMeta) ? best : null;
}

function solveMinCostAssignment(costs) {
  const rowCount = costs.length;
  if (!rowCount) return [];
  const columnCount = costs[0].length;
  if (columnCount < rowCount) throw new Error('Assignment matrix needs at least as many columns as rows.');

  // Hungarian algorithm for a rectangular matrix where rows <= columns.
  const rowPotential = new Array(rowCount + 1).fill(0);
  const columnPotential = new Array(columnCount + 1).fill(0);
  const matchedRow = new Array(columnCount + 1).fill(0);
  const previousColumn = new Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minReducedCost = new Array(columnCount + 1).fill(Infinity);
    const usedColumn = new Array(columnCount + 1).fill(false);

    do {
      usedColumn[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Infinity;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column++) {
        if (usedColumn[column]) continue;
        const reducedCost = costs[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column];
        if (reducedCost < minReducedCost[column]) {
          minReducedCost[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minReducedCost[column] < delta) {
          delta = minReducedCost[column];
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columnCount; column++) {
        if (usedColumn[column]) {
          rowPotential[matchedRow[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minReducedCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const nextColumn = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignment = new Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column] > 0) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

function findOptimalLineup(squad, formation) {
  // Cache effective meta by exact FM position so, for example, a DL slot uses
  // DL meta rather than the player's best score at AML or any other position.
  const positionScores = new Map(squad.map(p => [
    p.id,
    p.attrs ? metaScoresByPosition(p, p.attrs) : [],
  ]));
  const groupForSlot = formation.map(slotMetaGroup);

  const candidatesForSlot = formation.map(slot => {
    return squad.map(p => {
      const scores = positionScores.get(p.id) || [];
      const bestPositionScore = bestMetaForSlot(p, slot, scores);
      return bestPositionScore
        ? { player: p, score: bestPositionScore.effectiveMeta, group: bestPositionScore.group }
        : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 11);
  });

  // Eleven candidates per slot are sufficient: at most ten other slots can use
  // higher-ranked players, so a lower-ranked candidate can never be required.
  const playersById = new Map();
  candidatesForSlot.forEach(list => list.forEach(candidate => playersById.set(candidate.player.id, candidate.player)));
  const candidatePlayers = [...playersById.values()];
  const allScores = candidatesForSlot.flatMap(list => list.map(candidate => candidate.score));
  const minScore = allScores.length ? Math.min(...allScores) : 0;
  const maxScore = allScores.length ? Math.max(...allScores) : 0;
  const maxAbsScore = Math.max(Math.abs(minScore), Math.abs(maxScore));
  const slotCount = formation.length;
  const cardinalityBonus = (2 * maxAbsScore + 1) * (slotCount + 1);
  const forbiddenCost = cardinalityBonus + Math.abs(minScore) + 1;
  const candidateMaps = candidatesForSlot.map(list => new Map(list.map(candidate => [candidate.player.id, candidate])));

  // Candidate assignments first maximize the number of filled positions, then
  // maximize effective meta. Dummy columns represent vacant positions.
  const costs = candidateMaps.map(candidateMap => [
    ...candidatePlayers.map(player => {
      const candidate = candidateMap.get(player.id);
      return candidate ? -(cardinalityBonus + candidate.score) : forbiddenCost;
    }),
    ...new Array(slotCount).fill(0),
  ]);
  const assignedColumns = solveMinCostAssignment(costs);
  const lineup = formation.map((slot, slotIdx) => {
    const col = assignedColumns[slotIdx];
    const candidate = col >= 0 && col < candidatePlayers.length
      ? candidateMaps[slotIdx].get(candidatePlayers[col].id)
      : null;
    return candidate
      ? { player: candidate.player, score: candidate.score, group: candidate.group || groupForSlot[slotIdx], role: slot.role, t: slot.t, l: slot.l }
      : { player: null, score: 0, group: groupForSlot[slotIdx], role: slot.role, t: slot.t, l: slot.l };
  });

  return { lineup, score: lineup.reduce((sum, slot) => sum + slot.score, 0) };
}
function autoDetectBestFormation(squad) {
  let bestFormationKey = null, bestResult = null, highestFilledCount = -1, highestAvgScore = -Infinity;
  const formationKeys = Object.keys(XI_FORMATIONS).filter(k => k !== 'custom' && k !== 'custom_active');

  formationKeys.forEach(fKey => {
    const formation = XI_FORMATIONS[fKey];
    const res = findOptimalLineup(squad, formation);
    if (res && res.lineup) {
      const filledCount = res.lineup.filter(slot => slot.player).length;
      const avg = res.score / 11;
      if (filledCount > highestFilledCount || (filledCount === highestFilledCount && avg > highestAvgScore)) {
        highestFilledCount = filledCount;
        highestAvgScore = avg;
        bestFormationKey = fKey;
        bestResult = res;
      }
    }
  });
  return { key: bestFormationKey, result: bestResult };
}

function triggerBestFormationAuto() {
  const myClub = (state.meta.myClub || '').toLowerCase();
  if (!myClub) { showToast(t('bestxi_autoNoClub'), 'warning'); return; }
  const squad = state.players.filter(p => (p.club || '').toLowerCase() === myClub && !state.xiIgnored.has(p.id));
  const best = autoDetectBestFormation(squad);
  if (best && best.key) {
    state.bestXiFormation = best.key;
    try { localStorage.setItem('fmss_xi_formation', best.key); } catch { }
    renderBestXI();
    showToast(tf('bestxi_autoToast', { f: best.key, s: fmtMeta(best.result.score / 11) }), 'check');
  } else {
    showToast(t('bestxi_autoFail'), 'warning');
  }
}
window.triggerBestFormationAuto = triggerBestFormationAuto;

function xiIgnorePlayer(id) {
  state.xiIgnored.add(id);
  try { localStorage.setItem('fmss_xi_ignored', JSON.stringify([...state.xiIgnored])); } catch {}
  renderBestXI();
}
function xiResetIgnored() {
  state.xiIgnored.clear();
  try { localStorage.setItem('fmss_xi_ignored', '[]'); } catch {}
  renderBestXI();
}

function xiProfFilterHtml() {
  return `<label class="xi-prof-filter">${escHtml(t('bestxi_minProf'))}
    <input id="xi-prof-threshold" type="number" min="1" max="20" step="1" value="${state.xiProfThreshold}" onchange="handleXiProfThresholdChange()">
  </label>`;
}

function handleXiProfThresholdChange() {
  const value = parseInt($('xi-prof-threshold')?.value, 10);
  state.xiProfThreshold = Number.isFinite(value) ? Math.max(1, Math.min(20, value)) : 15;
  try { localStorage.setItem('fmss_xi_prof_threshold', String(state.xiProfThreshold)); } catch {}
  renderBestXI();
}

function renderXiPitch(lineup, title, bench = false) {
  const slots = lineup || [];
  let html = `<div class="xi-pitch ${bench ? 'xi-pitch--bench' : ''}">
    <div class="xi-pitch-title">${escHtml(title)}</div>
    <div class="xi-field-halfway"></div><div class="xi-field-circle"></div>
    <div class="xi-field-box xi-field-box--top"></div><div class="xi-field-box xi-field-box--bottom"></div>`;

  slots.forEach(slot => {
    const player = slot.player;
    const score = player ? fmtMeta(slot.score) : '&#8211;';
    const name = player ? escHtml(player.name) : escHtml(t('bestxi_vacantPost'));
    const cls = player ? metaClass(slot.score, slot.group) : '';
    const side = slot.l < 30 ? ` ${t('bestxi_left')}` : slot.l > 70 ? ` ${t('bestxi_right')}` : '';
    const nameAction = player ? `onclick="showDetail(state.players.find(p=>p.id===${player.id}))"` : '';
    const ignore = player ? `<button class="xi-ignore" onclick="event.stopPropagation();xiIgnorePlayer(${player.id})" title="${escHtml(t('bestxi_ignore'))}">&#215;</button>` : '';
    html += `<div class="xi-player-slot ${!player ? 'xi-player-slot--vacant' : ''}" style="top:${slot.t}%;left:${slot.l}%">
      ${ignore}
      <div class="xi-slot-score v ${cls}" ${nameAction}>${score}</div>
      <div class="xi-slot-name" title="${name}" ${nameAction}>${name}</div>
      <div class="xi-slot-role">${escHtml(roleName(slot.role) + side)}</div>
    </div>`;
  });

  return html + '</div>';
}

function renderBestXI() {
  const box = $('bestxi');
  if (!box) return;

  if (state.bestXiFormation === 'custom') { renderInteractiveMap(); return; }

  const myClub = (state.meta.myClub || '').toLowerCase();
  const hasIgnored = state.xiIgnored.size > 0;

  let html = `<div class="an-head" style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; flex-wrap: wrap; gap: 10px;">
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <h2 style="margin:0;">${escHtml(t('bestxi_title'))}</h2>
        <button onclick="triggerBestFormationAuto()" style="padding: 5px 12px; background: #d97706; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">⚡ ${escHtml(t('bestxi_autoFind'))}</button>
        <button onclick="state.bestXiFormation = 'custom'; renderBestXI();" style="padding: 5px 12px; background: #7c3aed; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">✏️ ${escHtml(t('bestxi_editTactic'))}</button>
        ${hasIgnored ? `<button onclick="xiResetIgnored()" style="padding: 5px 12px; background: #dc2626; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">↺ ${escHtml(t('bestxi_resetIgnored'))}</button>` : ''}
    </div>
    <div class="xi-controls">
      ${xiProfFilterHtml()}
      <select id="xi-formation" onchange="handleFormationChange()" style="padding: 5px 10px; background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 5px; font-weight: bold; cursor: pointer;">
        ${Object.keys(XI_FORMATIONS).filter(f => f !== 'custom_active').map(f => `<option value="${f}" ${state.bestXiFormation === f ? 'selected' : ''}>${f}</option>`).join('')}
        <option value="custom" ${state.bestXiFormation === 'custom' || state.bestXiFormation === 'custom_active' ? 'selected' : ''}>${escHtml(t('bestxi_customOpt'))}</option>
      </select>
    </div>
  </div>`;

  if (!myClub) {
    box.innerHTML = html + `<div class="an-empty" style="text-align:center; padding: 20px;">${escHtml(t('bestxi_noClub'))}</div>`;
    return;
  }

  // Filter out ignored players from all XI/bench calculations
  const fullSquad = state.players.filter(p => (p.club || '').toLowerCase() === myClub);
  const squad = fullSquad.filter(p => !state.xiIgnored.has(p.id));
  const ignoredPlayers = fullSquad.filter(p => state.xiIgnored.has(p.id));

  const formation = state.bestXiFormation === 'custom_active' ? XI_FORMATIONS['custom_active'] : XI_FORMATIONS[state.bestXiFormation];
  if (!formation) return;

  const result = findOptimalLineup(squad, formation);
  let benchResult = null;
  if (result && result.lineup) {
    const titularIds = new Set(result.lineup.map(slot => slot.player ? slot.player.id : null).filter(Boolean));
    const remainingSquad = squad.filter(p => !titularIds.has(p.id));
    benchResult = findOptimalLineup(remainingSquad, formation);
  }

  const layoutHtml = `<div class="xi-layout">
    ${renderXiPitch(result?.lineup, t('tabBestxi'))}
    ${renderXiPitch(benchResult?.lineup, t('bestxi_bench'), true)}
  </div>`;
  let scoreFooter = result && result.lineup ? `<div style="text-align:center; color:#94a3b8; font-size:15px; margin-top:10px; font-weight:bold;">${escHtml(t('bestxi_avgScore'))} <strong style="color:#34d399; font-size:17px;">${fmtMeta(result.score / 11)}</strong></div>` : '';

  // Unavailable panel — shown when any player is ignored
  let ignoredHtml = '';
  if (ignoredPlayers.length > 0) {
    ignoredHtml = `<div style="margin: 0 20px 20px; background: #1e293b; border: 1px solid #7f1d1d; border-radius: 10px; padding: 12px 16px;">
      <div style="font-size:11px; font-weight:bold; color:#fca5a5; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px;">🚫 ${escHtml(t('bestxi_ignored'))}</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${ignoredPlayers.map(p => {
          return `<div style="display:flex; align-items:center; gap:5px; background:#0f172a; border:1px solid #7f1d1d; border-radius:6px; padding:4px 8px;">
            <span style="font-size:11px; color:#fecaca; cursor:pointer;" onclick="showDetail(state.players.find(q=>q.id===${p.id}))">${escHtml(p.name)}</span>
            <button onclick="state.xiIgnored.delete(${p.id}); try{localStorage.setItem('fmss_xi_ignored',JSON.stringify([...state.xiIgnored]))}catch{}; renderBestXI();" style="padding:1px 5px; background:rgba(74,222,128,0.2); color:#4ade80; border:1px solid #4ade80; border-radius:3px; font-size:10px; cursor:pointer;">+</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  box.innerHTML = html + layoutHtml + scoreFooter + ignoredHtml;
}

let customSelectedSlots = jread('fmss_xi_custom', []);
// Herstel de custom tactiek als die bij vorige sessie bevestigd was
if (state.bestXiFormation === 'custom_active') {
  if (customSelectedSlots.length === 11) {
    XI_FORMATIONS['custom_active'] = customSelectedSlots;
  } else {
    state.bestXiFormation = '4-3-3'; // onvolledige opgeslagen data: fallback
  }
}
const INTERACTIVE_MAP = [
    { id: 'fw_C', role: 'af', line: 'fw', side: 'C', label: 'BT' },
    { id: 'fw_CL', role: 'af', line: 'fw', side: 'CL', label: 'BT (G)' },
    { id: 'fw_CR', role: 'af', line: 'fw', side: 'CR', label: 'BT (D)' },
    { id: 'am_L', role: 'wing', line: 'am', side: 'L', label: 'MO (G)' },
    { id: 'am_CL', role: 'am', line: 'am', side: 'CL', label: 'MO (CG)' },
    { id: 'am_C', role: 'am', line: 'am', side: 'C', label: 'MO (C)' },
    { id: 'am_CR', role: 'am', line: 'am', side: 'CR', label: 'MO (CD)' },
    { id: 'am_R', role: 'wing', line: 'am', side: 'R', label: 'MO (D)' },
    { id: 'cm_L', role: 'wing', line: 'cm', side: 'L', label: 'M (G)' },
    { id: 'cm_CL', role: 'cm', line: 'cm', side: 'CL', label: 'MC (G)' },
    { id: 'cm_C', role: 'cm', line: 'cm', side: 'C', label: 'MC (C)' },
    { id: 'cm_CR', role: 'cm', line: 'cm', side: 'CR', label: 'MC (D)' },
    { id: 'cm_R', role: 'wing', line: 'cm', side: 'R', label: 'M (D)' },
    { id: 'dm_L', role: 'wb', line: 'dm', side: 'L', label: 'WB (G)' },
    { id: 'dm_CL', role: 'dm', line: 'dm', side: 'CL', label: 'MD (G)' },
    { id: 'dm_C', role: 'dm', line: 'dm', side: 'C', label: 'MD' },
    { id: 'dm_CR', role: 'dm', line: 'dm', side: 'CR', label: 'MD (D)' },
    { id: 'dm_R', role: 'wb', line: 'dm', side: 'R', label: 'WB (D)' },
    { id: 'df_L', role: 'fb', line: 'df', side: 'L', label: 'DL' },
    { id: 'df_CL', role: 'cd', line: 'df', side: 'CL', label: 'DC (G)' },
    { id: 'df_C', role: 'cd', line: 'df', side: 'C', label: 'DC (C)' },
    { id: 'df_CR', role: 'cd', line: 'df', side: 'CR', label: 'DC (D)' },
    { id: 'df_R', role: 'fb', line: 'df', side: 'R', label: 'DR' },
    { id: 'gk_C', role: 'gk', line: 'gk', side: 'C', label: 'GB' }
];

function handleFormationChange() {
  const select = document.getElementById('xi-formation');
  if (!select) return;
  if (select.value === 'custom') {
    state.bestXiFormation = 'custom';
    try { localStorage.setItem('fmss_xi_formation', 'custom'); } catch { }
    if (customSelectedSlots.length === 0) {
      customSelectedSlots = JSON.parse(JSON.stringify(XI_FORMATIONS['4-3-3']));
    }
    renderInteractiveMap();
  } else {
    state.bestXiFormation = select.value;
    try { localStorage.setItem('fmss_xi_formation', select.value); } catch { }
    renderBestXI();
  }
}

function renderInteractiveMap() {
  const box = $('bestxi');
  if (!box) return;
  const lineHeights = { 'fw': 12, 'am': 28, 'cm': 44, 'dm': 60, 'df': 76, 'gk': 91 };
  const sideWidths = { 'L': 12, 'CL': 31, 'C': 50, 'CR': 69, 'R': 88 };
  const isReady = customSelectedSlots.length === 11;

  let html = `<div class="an-head" style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px;">
      <h2>${escHtml(tf('tactic_title', { n: customSelectedSlots.length }))}</h2>
      <div class="xi-controls">
          ${xiProfFilterHtml()}
          <select id="xi-formation" onchange="handleFormationChange()" style="padding: 5px 10px; background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 5px; font-weight: bold; cursor: pointer;">
              ${Object.keys(XI_FORMATIONS).map(f => `<option value="${f}">${f}</option>`).join('')}
              <option value="custom" selected>${escHtml(t('bestxi_customOpt'))}</option>
          </select>
          <button onclick="confirmCustomTactics()" ${!isReady ? 'disabled' : ''} style="padding: 6px 14px; background: ${isReady ? '#8b5cf6' : '#334155'}; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: ${isReady ? 'pointer' : 'not-allowed'}; font-size: 12px;">${escHtml(t('tactic_confirm'))}</button>
      </div>
  </div>`;

  let pitchHtml = `<div style="position:relative; width:100%; max-width:700px; height:780px; background-color:#12301c; margin:20px auto; border-radius:12px; border:2px solid #2a3441; overflow:hidden;">`;
  INTERACTIVE_MAP.forEach(slot => {
      const topPct = lineHeights[slot.line];
      const leftPct = sideWidths[slot.side] || 50;
      const isActivated = customSelectedSlots.some(s => s.line === slot.line && s.side === slot.side && s.role === slot.role);
      const btnStyle = isActivated ? "background: #8b5cf6; color: #fff; border: 2px solid #c4b5fd;" : "background: rgba(15,23,42,0.6); color: #94a3b8; border: 2px dashed #475569;";
      pitchHtml += `<button onclick="toggleCustomSlot('${slot.line}', '${slot.side}', '${slot.role}')" style="position:absolute; top:${topPct}%; left:${leftPct}%; transform:translate(-50%, -50%); width:52px; height:42px; border-radius:8px; font-weight:bold; font-size:9px; cursor:pointer; z-index:20; ${btnStyle}">${slot.label}</button>`;
  });
  pitchHtml += `</div>`;
  box.innerHTML = html + pitchHtml;
}

function toggleCustomSlot(line, side, role) {
  const index = customSelectedSlots.findIndex(s => s.line === line && s.side === side);
  if (index !== -1) { customSelectedSlots.splice(index, 1); }
  else {
    if (customSelectedSlots.length >= 11) { showToast(t('tactic_maxStarters'), 'warning'); return; }
    customSelectedSlots.push({ role, line, side, t: line === 'fw' ? 15 : line === 'am' ? 30 : line === 'cm' ? 45 : line === 'dm' ? 60 : line === 'df' ? 75 : 90, l: side === 'L' ? 15 : side === 'CL' ? 33 : side === 'C' ? 50 : side === 'CR' ? 67 : 85 });
  }
  renderInteractiveMap();
}

function confirmCustomTactics() {
  if (customSelectedSlots.length !== 11) return;
  XI_FORMATIONS['custom_active'] = customSelectedSlots;
  state.bestXiFormation = 'custom_active';
  try { localStorage.setItem('fmss_xi_formation', 'custom_active'); } catch { }
  try { localStorage.setItem('fmss_xi_custom', JSON.stringify(customSelectedSlots)); } catch { }
  renderBestXI();
}

let clubListRows = [], clubListSortKey = 'name', clubListSortDir = 1;
let clubListScrollQueued = false;
const CLUB_LIST_ROW_H = 34;
const CLUB_LIST_COLS = [
  { key: 'name', label: 'clubColName', get: c => c.name || '' },
  { key: 'nation', label: 'clubColNation', get: c => c.nation || '' },
  { key: 'league', label: 'clubColLeague', get: c => c.div || c.league || '' },
  { key: 'reputation', label: 'clubColReputation', num: true, get: c => c.reputation ?? c.rep },
  { key: 'balance', label: 'clubColBalance', money: true, get: c => clubFinanceValue(c, ['balance', 'clubBalance', 'club_balance']) },
  { key: 'transferBudget', label: 'clubColTransferBudget', money: true, get: c => clubFinanceValue(c, ['transferBudget', 'transfer_budget']) },
  { key: 'remainingTransfer', label: 'clubColTransferRemaining', money: true, get: c => clubFinanceValue(c, ['remainingTransfer', 'transferRemaining', 'transferBudgetRemaining', 'remainingTransferBudget', 'remaining_transfer']) },
  { key: 'wageBudget', label: 'clubColWageBudget', money: true, wage: true, get: c => clubFinanceValue(c, ['wageBudget', 'wage_budget']) },
  { key: 'wageUsed', label: 'clubColWageUsed', money: true, wage: true, get: c => {
    const used = clubFinanceValue(c, ['wageUsed', 'wage_used']);
    if (used != null) return used;
    const budget = clubFinanceValue(c, ['wageBudget', 'wage_budget']);
    const remaining = clubFinanceValue(c, ['remainingWage', 'wageRemaining', 'wageBudgetRemaining', 'remainingWageBudget', 'remaining_wage']);
    return budget != null && remaining != null ? Number(budget) - Number(remaining) : null;
  } },
  { key: 'trainingFacilities', label: 'clubColTrainingFacilities', num: true, get: c => clubDataValue(c, ['trainingFacilities', 'trainingFacility', 'trainingFac', 'training_facilities']) },
  { key: 'youthTrainingFacilities', label: 'clubColYouthTrainingFacilities', num: true, get: c => clubDataValue(c, ['youthTrainingFacilities', 'youthTrainingFacility', 'youthFacilities', 'youth_training_facilities']) },
  { key: 'juniorCoaching', label: 'clubColJuniorCoaching', num: true, get: c => clubDataValue(c, ['juniorCoaching', 'junior_coaching']) },
  { key: 'youthRecruitment', label: 'clubColYouthRecruitment', num: true, get: c => clubDataValue(c, ['youthRecruitment', 'youthRecruitmentNet', 'youthRecruitmentNetwork', 'youth_recruitment']) },
];
const CLUB_FILTER_RANGE_KEYS = ['reputation', 'transferBudget', 'remainingTransfer', 'wageBudget', 'wageUsed', 'balance', 'trainingFacilities', 'youthTrainingFacilities', 'juniorCoaching', 'youthRecruitment'];
const CLUB_LIST_COL_BY_KEY = new Map(CLUB_LIST_COLS.map(col => [col.key, col]));
function clubDataValue(club, keys) {
  for (const key of keys) if (club?.[key] != null && club[key] !== '') return club[key];
  return null;
}
function clubFinanceValue(club, keys) {
  const seniorCount = state._clubSeniorSquadCounts?.get(Number(club?.id)) || 0;
  if (seniorCount < 11) return null;
  const financeChecks = [
    { keys: ['balance', 'clubBalance', 'club_balance'], limit: 100_000_000_000, absolute: true },
    { keys: ['transferBudget', 'transfer_budget'], limit: 1_000_000_000 },
    { keys: ['remainingTransfer', 'transferRemaining', 'transferBudgetRemaining', 'remainingTransferBudget', 'remaining_transfer'], limit: 1_000_000_000 },
    { keys: ['wageBudget', 'wage_budget'], limit: 100_000_000 },
    { keys: ['wageUsed', 'wage_used'], limit: 100_000_000 },
    { keys: ['remainingWage', 'wageRemaining', 'wageBudgetRemaining', 'remainingWageBudget', 'remaining_wage'], limit: 100_000_000 },
  ];
  for (const check of financeChecks) {
    const candidate = clubDataValue(club, check.keys);
    if (candidate == null || candidate === '') continue;
    const amount = Number(candidate);
    if (!Number.isFinite(amount) || (check.absolute ? Math.abs(amount) : amount) > check.limit) return null;
  }
  const value = clubDataValue(club, keys);
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return value;
}
function clubListValue(col, club) {
  const value = col.get(club);
  if (value == null || value === '') return null;
  if (col.num || col.money || col.wage) {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }
  return String(value);
}
function fmtClubMoney(value, col) {
  const converted = Number(value) * (CUR_RATE[state.cur] || 1) * (col?.wage ? wageFactor() : 1);
  if (!Number.isFinite(converted)) return '–';
  return `${state.cur}\u00a0${Math.ceil(converted).toLocaleString(uiLocale(), { maximumFractionDigits: 0 })}`;
}
function renderClubListHeader() {
  const head = $('club-list-head');
  if (!head) return;
  head.innerHTML = CLUB_LIST_COLS.map(col => {
    const sorted = clubListSortKey === col.key;
    const suffix = col.wage ? ' ' + wageSuf() : '';
    const arrow = sorted ? (clubListSortDir > 0 ? ' ▲' : ' ▼') : '';
    return `<th data-club-sort="${col.key}" class="${sorted ? 'sorted' : ''}">${escHtml(t(col.label) + suffix)}${arrow}</th>`;
  }).join('');
}
function sortClubListRows() {
  const col = CLUB_LIST_COLS.find(x => x.key === clubListSortKey) || CLUB_LIST_COLS[0];
  const collator = new Intl.Collator(state.lang, { numeric: true, sensitivity: 'base' });
  clubListRows.sort((a, b) => {
    const av = clubListValue(col, a), bv = clubListValue(col, b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const compare = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv));
    return compare * clubListSortDir;
  });
}
function renderClubList() {
  if (!$('club-filter-name')) return;
  applyClubListFilters();
}
let clubLeagueSource = null, clubLeaguePlayersSource = null, clubLeagueIndexCache = [];
function buildClubLeagueIndex() {
  const clubs = state.clubs || [], players = state.players || [];
  if (clubs === clubLeagueSource && players === clubLeaguePlayersSource) return clubLeagueIndexCache;
  clubLeagueSource = clubs; clubLeaguePlayersSource = players;
  const seniorPlayers = players.filter(p => p.teamType == null || p.teamType === 0);
  const activeClubIds = new Set(seniorPlayers.map(p => Number(p.clubId) || 0).filter(id => id > 0));
  const byLeague = new Map();
  const add = (info, reputation, active) => {
    if (!info) return;
    let league = byLeague.get(info.key);
    if (!league) byLeague.set(info.key, league = { ...info, strength: 0, count: 0, active: false });
    league.count++;
    league.strength = Math.max(league.strength, Number(reputation) || 0);
    league.active ||= active;
  };
  for (const club of clubs) if (club.div || club.league) {
    const hasActiveList = activeClubIds.size > 0;
    const active = !hasActiveList || activeClubIds.has(Number(club.id));
    add(divisionInfo(club.div || club.league, club.nation, club.divisionId), club.reputation, active);
  }
  const clubsById = clubCatalogById();
  for (const player of seniorPlayers) if (player.div) {
    const active = !activeClubIds.size || activeClubIds.has(Number(player.clubId));
    add(playerDivisionInfo(player, clubsById), player.clubRep, active);
  }
  const myLeagues = state.myDivs || new Set();
  clubLeagueIndexCache = [...byLeague.values()].map(league => ({
    ...league,
    name: league.label,
    norm: normStr(league.label),
    queryNorm: normStr(league.raw),
    mine: myLeagues.has(league.label),
  })).sort((a, b) => Number(b.active) - Number(a.active) || b.strength - a.strength || b.count - a.count || a.label.localeCompare(b.label, uiLocale()));
  return clubLeagueIndexCache;
}
let clubNationSource = null, clubNationPlayersSource = null, clubNationIndexCache = [];
function buildClubNationIndex() {
  const clubs = state.clubs || [], players = state.players || [];
  if (clubs === clubNationSource && players === clubNationPlayersSource) return clubNationIndexCache;
  clubNationSource = clubs; clubNationPlayersSource = players;
  const seniorPlayers = players.filter(p => p.teamType == null || p.teamType === 0);
  const activeClubIds = new Set(seniorPlayers.map(p => Number(p.clubId) || 0).filter(id => id > 0));
  const byNation = new Map();
  for (const club of clubs) {
    const nation = String(club.nation || '').trim();
    if (!nation) continue;
    const key = normStr(nation);
    let entry = byNation.get(key);
    if (!entry) byNation.set(key, entry = { name: nation, norm: key, strength: 0, count: 0, active: false, mine: false });
    const active = !activeClubIds.size || activeClubIds.has(Number(club.id));
    entry.active ||= active;
    entry.strength = Math.max(entry.strength, Number(club.reputation) || 0);
    entry.count++;
    entry.mine ||= (Number(state.meta.myClubId) > 0
      ? Number(club.id) === Number(state.meta.myClubId)
      : normStr(club.name) === normStr(state.meta.myClub));
  }
  clubNationIndexCache = [...byNation.values()].map(entry => ({
    ...entry, label: entry.name, queryNorm: entry.norm,
  })).sort((a, b) => Number(b.active) - Number(a.active) || b.strength - a.strength || b.count - a.count || a.name.localeCompare(b.name, uiLocale()));
  return clubNationIndexCache;
}
function clubFilterDisplayNumber(key, club) {
  const col = CLUB_LIST_COL_BY_KEY.get(key);
  const value = col && clubListValue(col, club);
  if (typeof value !== 'number') return null;
  return col.money ? Math.ceil(value * (CUR_RATE[state.cur] || 1) * (col.wage ? wageFactor() : 1)) : value;
}
function applyClubListFilters() {
  if (!$('club-filter-name')) return;
  const name = $('club-filter-name').value.trim().toLocaleLowerCase(uiLocale());
  const nation = $('club-filter-nation').value.trim().toLocaleLowerCase(uiLocale());
  const league = $('club-filter-league').value.trim().toLocaleLowerCase(uiLocale());
  const ranges = CLUB_FILTER_RANGE_KEYS.map(key => ({
    key,
    min: document.querySelector(`[data-club-min="${key}"]`)?.value ?? '',
    max: document.querySelector(`[data-club-max="${key}"]`)?.value ?? '',
  })).filter(range => range.min !== '' || range.max !== '');
  clubListRows = (state.clubs || []).filter(c => {
    if (!c || !c.name) return false;
    if (name && !String(c.name).toLocaleLowerCase(uiLocale()).includes(name)) return false;
    if (nation && !normStr(c.nation || '').includes(normStr(nation))) return false;
    const clubLeague = divisionInfo(c.div || c.league, c.nation, c.divisionId)?.label || c.div || c.league || '';
    if (league && !normStr(clubLeague).includes(normStr(league))) return false;
    for (const range of ranges) {
      const value = clubFilterDisplayNumber(range.key, c);
      if (value == null || (range.min !== '' && value < Number(range.min)) || (range.max !== '' && value > Number(range.max))) return false;
    }
    return true;
  });
  sortClubListRows();
  renderClubListHeader();
  const count = $('club-list-count');
  if (count) count.textContent = tf('clubListCount', { n: clubListRows.length.toLocaleString(uiLocale()) });
  const wrap = $('club-list-table-wrap');
  if (wrap) wrap.scrollTop = 0;
  renderClubListVisible();
}
function renderClubListVisible() {
  const wrap = $('club-list-table-wrap'), body = $('club-list-body');
  if (!wrap || !body) return;
  const total = clubListRows.length;
  const first = Math.max(0, Math.floor(wrap.scrollTop / CLUB_LIST_ROW_H) - 8);
  const count = Math.ceil(wrap.clientHeight / CLUB_LIST_ROW_H) + 16;
  const last = Math.min(total, first + count);
  const cols = CLUB_LIST_COLS;
  if (!total) {
    body.innerHTML = `<tr><td class="club-list-empty dim" colspan="${cols.length}">${escHtml(t('clubs_noResults'))}</td></tr>`;
    return;
  }
  const spacer = height => height > 0 ? `<tr class="club-list-spacer"><td colspan="${cols.length}" style="height:${height}px"></td></tr>` : '';
  const rows = clubListRows.slice(first, last).map((club, i) => {
    const cells = cols.map(col => {
      const value = clubListValue(col, club);
      let display = '–';
      if (value != null) {
        if (col.money) display = typeof value === 'number' ? fmtClubMoney(value, col) : String(value);
        else if (col.num && typeof value === 'number') display = value.toLocaleString(uiLocale());
        else display = String(value);
      }
      const missingTip = value == null ? ` title="${escHtml(t('clubDataMissing'))}"` : '';
      return `<td class="${col.num || col.money || col.wage ? 'num' : ''} ${value == null ? 'dim' : ''}"${missingTip}>${escHtml(display)}</td>`;
    }).join('');
    return `<tr class="${(first + i) % 2 ? 'even' : ''}" style="height:${CLUB_LIST_ROW_H}px">${cells}</tr>`;
  }).join('');
  body.innerHTML = spacer(first * CLUB_LIST_ROW_H) + rows + spacer((total - last) * CLUB_LIST_ROW_H);
}
// ---------- squad-behoefteanalyse ----------
// Positiegroepen met een streefaantal (basis + degelijke cover) en de bijhorende pitch-codes.
const SQUAD_GROUPS = [
  { id: 'gk', label: { nl: 'Keeper', en: 'Goalkeeper', fr: 'Gardien', de: 'Torwart' }, pos: ['GK'], target: 2 },
  { id: 'cb', label: { nl: 'Centrale verdediger', en: 'Central defender', fr: 'Défenseur central', de: 'Innenverteidiger' }, pos: ['DC'], target: 4 },
  { id: 'fb', label: { nl: 'Vleugelverdediger', en: 'Full back', fr: 'Arrière latéral', de: 'Außenverteidiger' }, pos: ['DL', 'DR', 'WBL', 'WBR'], target: 4 },
  { id: 'dm', label: { nl: 'Verdedigende mid', en: 'Defensive mid', fr: 'Milieu défensif', de: 'Defensives MF' }, pos: ['DM'], target: 2 },
  { id: 'cm', label: { nl: 'Centrale middenvelder', en: 'Central midfielder', fr: 'Milieu central', de: 'Zentrales MF' }, pos: ['MC'], target: 3 },
  { id: 'wing', label: { nl: 'Buitenspeler', en: 'Winger', fr: 'Ailier', de: 'Flügelspieler' }, pos: ['ML', 'MR', 'AML', 'AMR'], target: 4 },
  { id: 'am', label: { nl: 'Aanvallende mid', en: 'Attacking mid', fr: 'Milieu offensif', de: 'Offensives MF' }, pos: ['AMC'], target: 2 },
  { id: 'st', label: { nl: 'Spits', en: 'Striker', fr: 'Attaquant', de: 'Stürmer' }, pos: ['ST'], target: 3 },
];
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
function legacyAnalyseSquad() {
  const club = (state.meta.myClub || '').toLowerCase();
  if (!club) return null;
  if (analysisDataCache && analysisDataCache.players === state.players
    && analysisDataCache.playerCount === state.players.length
    && analysisDataCache.shortlist === state.shortlist
    && analysisDataCache.shortlistVersion === analysisShortlistVersion
    && analysisDataCache.club === club) return analysisDataCache.data;
  const squad = [], shortlist = [];
  for (const p of state.players) {
    const isOwnClub = (p.club || '').toLowerCase() === club;
    if (isOwnClub) squad.push(p);
    else if (state.shortlist.has(p.id)) shortlist.push(p);
  }
  const data = { squad, shortlist };
  analysisDataCache = {
    players: state.players, playerCount: state.players.length,
    shortlist: state.shortlist, shortlistVersion: analysisShortlistVersion, club, data,
  };
  return data;
  const groups = SQUAD_GROUPS.map(g => {
    const set = new Set(g.pos);
    const members = squad.filter(p => (p.posArr || []).some(x => set.has(x))).sort((a, b) => (b.ca || 0) - (a.ca || 0));
    const cas = members.map(p => p.ca || 0);
    const ages = members.map(p => getAge(p)).filter(x => x != null);
    const bestCa = cas.length ? Math.max(...cas) : 0;
    const youngTalents = members.filter(p => { const a = getAge(p); return a > 0 && a <= 21 && (p.pa || 0) > 0; }).sort((a, b) => (b.pa || 0) - (a.pa || 0));
    const succ = youngTalents.find(p => (p.pa || 0) >= bestCa);   // jong talent dat het niveau haalt
    // Statusbepaling
    let status = 'ok';
    if (members.length < Math.ceil(g.target / 2)) status = 'short';
    else if (members.length < g.target) status = 'thin';
    const avgAge = avg(ages);
    const aging = avgAge >= 28.5 && !succ && members.length > 0;
    // Aanbeveling + scout-parameters
    let rec = null, scout = null;
    const suggPa = Math.max(bestCa, Math.round(avg(cas) + 12) || 120);
    const np = state.hideCapa ? 'Np' : '';   // number-free varianten als CA/PA verborgen is
    if (status === 'short') {
      const n = g.target - members.length;
      rec = tf('anRecShort' + np, { n, pa: suggPa }); scout = { pos: g.pos, minPa: Math.max(80, suggPa - 20) };
    } else if (aging) {
      rec = tf('anRecAging' + np, { age: 23, pa: bestCa }); scout = { pos: g.pos, maxAge: 23, minPa: bestCa };
    } else if (!succ && members.length) {
      rec = tf('anRecSucc' + np, { age: 23, pa: bestCa }); scout = { pos: g.pos, maxAge: 23, minPa: bestCa };
    } else if (status === 'thin') {
      rec = tf('anRecThin' + np, { pa: suggPa }); scout = { pos: g.pos, minPa: suggPa };
    }
    // prioriteit voor sortering/samenvatting
    const prio = status === 'short' ? 3 : aging ? 2.5 : (!succ && members.length) ? 1.5 : status === 'thin' ? 1 : 0;
    return { g, members, count: members.length, avgAge, avgCa: avg(cas), bestCa, youngTalents, succ, status, aging, rec, scout, prio };
  });
  return { squad, groups, shortlist };
}
function analyseSquad() {
  const club = (state.meta.myClub || '').toLowerCase();
  if (!club) return null;
  if (analysisDataCache && analysisDataCache.players === state.players
    && analysisDataCache.playerCount === state.players.length
    && analysisDataCache.shortlist === state.shortlist
    && analysisDataCache.shortlistVersion === analysisShortlistVersion
    && analysisDataCache.club === club) return analysisDataCache.data;
  const squad = [], shortlist = [];
  for (const player of state.players) {
    const isOwnClub = (player.club || '').toLowerCase() === club;
    if (isOwnClub) squad.push(player);
    else if (state.shortlist.has(player.id)) shortlist.push(player);
  }
  const data = { squad, shortlist };
  analysisDataCache = {
    players: state.players, playerCount: state.players.length,
    shortlist: state.shortlist, shortlistVersion: analysisShortlistVersion, club, data,
  };
  return data;
}
// simpele template-invuller {key}
function tf(key, vars) { return t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k]); }

// ---------- Analysis: club squad versus transfer shortlist ----------
// The formation is deliberately read from state.bestXiFormation: this makes the
// selector here and the one in Best XI two views of the same tactical choice.
const VS_POSITION_ORDER = ['GK', 'DC', 'FB', 'DM', 'MC', 'WM', 'AM', 'ST'];
const VS_TEAM_GROUPS = ['first', 'res', 'youth'];
const VS_POSITION_LABELS = {
  GK: 'GK', DC: 'DC', FB: 'FB', DM: 'DM', MC: 'MC', WM: 'WM', AM: 'AM', ST: 'ST'
};

function vsFormation() {
  return XI_FORMATIONS[state.bestXiFormation] || XI_FORMATIONS['4-3-3'];
}

function vsSelectedTeamGroups() {
  return new Set(Array.isArray(state.vsTeamFilter)
    ? state.vsTeamFilter.filter(group => VS_TEAM_GROUPS.includes(group))
    : VS_TEAM_GROUPS);
}
function analysisSelectedTeamGroups() {
  return new Set(Array.isArray(state.anTeamFilter)
    ? state.anTeamFilter.filter(group => VS_TEAM_GROUPS.includes(group))
    : VS_TEAM_GROUPS);
}
function vsTeamFilterMatches(p, selected) {
  return selected.size === VS_TEAM_GROUPS.length || selected.has(teamGroup(p.teamType));
}
function renderTeamGroupFilters(inputClass, selected) {
  const labels = { first: 'mt_first', res: 'mt_res', youth: 'mt_youth' };
  const options = VS_TEAM_GROUPS.map(group => `<label><input class="${inputClass}" type="checkbox" data-vs-team="${group}" ${selected.has(group) ? 'checked' : ''}>${escHtml(t(labels[group]))}</label>`).join('');
  return `<div class="team-group-filters" role="group" aria-label="${escHtml(t('vsTeamFilter'))}"><span>${escHtml(t('vsTeamFilter'))}</span>${options}</div>`;
}

function vsPositionGroups() {
  const groups = new Set(vsFormation().map(slotMetaGroup).filter(Boolean));
  return VS_POSITION_ORDER.filter(group => groups.has(group));
}

function vsScoreForGroup(p, group) {
  if (!p.attrs) return null;
  const scores = metaScoresByPosition(p, p.attrs).filter(x => x.group === group);
  return scores.length ? scores[0].effectiveMeta : null;
}

function vsPlayerSort(group, sortKey) {
  return (a, b) => {
    const av = sortKey === 'meta' ? vsScoreForGroup(a, group)
      : sortKey === 'age' ? getAge(a) : sortKey === 'name' ? a.name : (a.ca || 0);
    const bv = sortKey === 'meta' ? vsScoreForGroup(b, group)
      : sortKey === 'age' ? getAge(b) : sortKey === 'name' ? b.name : (b.ca || 0);
    if (sortKey === 'name') return String(av || '').localeCompare(String(bv || ''));
    return (Number(bv) || -Infinity) - (Number(av) || -Infinity);
  };
}

function vsPlayerTable(players, group, title, kind, limit) {
  const sortKey = state.vsSorts[`${group}:${kind}`] || 'meta';
  const rows = players.slice().sort(vsPlayerSort(group, sortKey)).slice(0, limit);
  const options = [['meta', t('c_meta')], ['ca', 'CA'], ['age', t('anAvgAge')], ['name', t('c_name')]]
    .map(([key, label]) => `<option value="${key}" ${sortKey === key ? 'selected' : ''}>${escHtml(label)}</option>`).join('');
  const noRows = `<tr><td colspan="5" class="vs-empty">–</td></tr>`;
  return `<div class="vs-table-box">
    <div class="vs-table-head"><b>${escHtml(title)}</b><label>${escHtml(t('vsSort'))} <select class="vs-sort" data-vs-group="${group}" data-vs-kind="${kind}">${options}</select></label></div>
    <table class="vs-table"><thead><tr><th>${escHtml(t('c_name'))}</th><th>${escHtml(t('c_pos'))}</th><th>${escHtml(t('c_meta'))}</th>${state.hideCapa ? '' : '<th>CA</th>'}<th>${escHtml(t('anAvgAge'))}</th></tr></thead>
    <tbody>${rows.length ? rows.map(p => {
      const score = vsScoreForGroup(p, group);
      return `<tr data-vs-player="${p.id}"><td>${escHtml(p.name || '–')}</td><td>${escHtml((p.posArr || []).join(', '))}</td><td>${score == null ? '–' : fmtMeta(score)}</td>${state.hideCapa ? '' : `<td>${p.ca || '–'}</td>`}<td>${getAge(p) || '–'}</td></tr>`;
    }).join('') : noRows}</tbody></table>
  </div>`;
}

function legacyRenderVsShortlist(squad) {
  const clubIds = new Set(squad.map(p => p.id));
  const shortlist = state.players.filter(p => state.shortlist.has(p.id) && !clubIds.has(p.id));
  const formationOptions = Object.keys(XI_FORMATIONS).filter(key => key !== 'custom_active')
    .map(key => `<option value="${key}" ${state.bestXiFormation === key || (key === 'custom' && state.bestXiFormation === 'custom_active') ? 'selected' : ''}>${key === 'custom' ? t('bestxi_customOpt') : key}</option>`).join('');
  const positions = vsPositionGroups().map(group => {
    const clubCount = Math.max(0, Number(state.vsClubCounts[group] ?? 5));
    const shortlistCount = Math.max(0, Number(state.vsShortlistCounts[group] ?? 5));
    const clubPlayers = squad.filter(p => vsScoreForGroup(p, group) != null);
    const shortPlayers = shortlist.filter(p => vsScoreForGroup(p, group) != null);
    return `<article class="vs-position">
      <div class="vs-position-head"><h3>${VS_POSITION_LABELS[group]}</h3><div class="vs-limits">
        <label>${escHtml(t('anPlayers'))} <input class="vs-count" data-vs-group="${group}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
        <label>${escHtml(t('shortlist'))} <input class="vs-count" data-vs-group="${group}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
      </div></div>
      <div class="vs-tables">${vsPlayerTable(clubPlayers, group, t('c_club'), 'club', clubCount)}${vsPlayerTable(shortPlayers, group, t('shortlist'), 'shortlist', shortlistCount)}</div>
    </article>`;
  }).join('');
  return `<section class="vs-shortlist"><div class="vs-head"><div><h2>${escHtml(t('vsTitle'))}</h2><p>${escHtml(t('vsDescription'))}</p></div><label>${escHtml(t('vsFormation'))} <select id="vs-formation">${formationOptions}</select></label></div>${positions}</section>`;
}

// The compact lists above were the first version of this view.  Keep the data
// helpers local, but replace the UI below with full player-style tables.
function vsPositionSlots() {
  const seen = new Set();
  return vsFormation().flatMap(slot => slotFmPositions(slot)).filter(pos => {
    if (seen.has(pos)) return false;
    seen.add(pos); return true;
  }).sort((a, b) => (POS_RANK[a] ?? 99) - (POS_RANK[b] ?? 99));
}
function vsPlayersByPosition(players, positions, threshold, selectedTeams = null) {
  const allowed = new Set(positions), result = new Map(positions.map(pos => [pos, []]));
  const allTeamsSelected = !selectedTeams || selectedTeams.size === VS_TEAM_GROUPS.length;
  for (const p of players) {
    if (!allTeamsSelected && !selectedTeams.has(teamGroup(p.teamType))) continue;
    const proficiency = p.posProficiency;
    if (proficiency && Object.keys(proficiency).length) {
      for (const [pos, value] of Object.entries(proficiency)) {
        if (allowed.has(pos) && Number(value) >= threshold) result.get(pos).push(p);
      }
    } else {
      const seen = new Set();
      for (const pos of p.posArr || []) {
        if (allowed.has(pos) && !seen.has(pos)) { result.get(pos).push(p); seen.add(pos); }
      }
    }
  }
  return result;
}
function vsScoreForPosition(p, pos) {
  if (!p.attrs) return null;
  let cached = vsPositionMetaCache.get(p);
  if (!cached || cached.attrs !== p.attrs) {
    cached = { attrs: p.attrs, scores: new Map(metaScoresByPosition(p, p.attrs).map(x => [x.pos, x.effectiveMeta])) };
    vsPositionMetaCache.set(p, cached);
  }
  return cached.scores.get(pos) ?? null;
}
function vsPotentialScoresByPosition(p) {
  if (!p.attrs) return new Map();
  const age = getAge(p);
  let cached = vsPotentialMetaCache.get(p);
  if (cached && cached.attrs === p.attrs && cached.ca === p.ca && cached.pa === p.pa && cached.age === age) return cached.scores;
  const currentCache = vsPositionMetaCache.get(p);
  const current = currentCache && currentCache.attrs === p.attrs
    ? currentCache.scores
    : new Map(metaScoresByPosition(p, p.attrs).map(x => [x.pos, x.effectiveMeta]));
  vsPositionMetaCache.set(p, { attrs: p.attrs, scores: current });
  const projectedAttrs = projectAttrs(p);
  const projected = projectedAttrs ? new Map(metaScoresByPosition(p, projectedAttrs).map(x => [x.pos, x.effectiveMeta])) : new Map();
  const scores = new Map();
  for (const [pos, value] of current) scores.set(pos, Math.max(value, projected.get(pos) ?? value));
  vsPotentialMetaCache.set(p, { attrs: p.attrs, ca: p.ca, pa: p.pa, age, scores });
  return scores;
}
function vsPotentialScoreForPosition(p, pos) {
  return vsPotentialScoresByPosition(p).get(pos) ?? null;
}
function vsMeetsProficiency(p, pos) {
  if (!p.posProficiency || !Object.keys(p.posProficiency).length) return (p.posArr || []).includes(pos);
  return (p.posProficiency[pos] || 0) >= state.vsProfThreshold;
}
function vsColConfig() {
  const keys = PLAYER_COLS.filter(c => !c.star).map(c => c.key);
  if (!state.vsColCfg || !Array.isArray(state.vsColCfg.order)) {
    state.vsColCfg = { order: [...keys], hidden: ['interest', ...PLAYER_COLS.filter(c => c.defHidden).map(c => c.key)] };
  }
  state.vsColCfg.order = state.vsColCfg.order.filter(k => keys.includes(k));
  keys.forEach(k => { if (!state.vsColCfg.order.includes(k)) state.vsColCfg.order.push(k); });
  // Name anchors a comparison while the remaining columns scroll horizontally.
  state.vsColCfg.order = ['name', ...state.vsColCfg.order.filter(k => k !== 'name')];
  state.vsColCfg.hidden = state.vsColCfg.hidden.filter(k => k !== 'name');
  return state.vsColCfg;
}
function vsActiveCols() {
  const cfg = vsColConfig(), hidden = new Set(cfg.hidden), byKey = Object.fromEntries(PLAYER_COLS.map(c => [c.key, c]));
  // This is deliberately one shared column set for the club and shortlist table.
  // No shortlist star here: the comparison is read-only and needs clean alignment.
  return cfg.order.filter(k => !hidden.has(k)).map(k => byKey[k]);
}
function vsValue(p, col, pos) { return col.key === 'meta' ? vsScoreForPosition(p, pos) : (col.get ? col.get(p) : null); }
function vsCell(p, col, pos) {
  if (col.key === 'meta') { const v = vsScoreForPosition(p, pos); return `<td class="num">${v == null ? '<span class="dim">–</span>' : fmtMeta(v)}</td>`; }
  if (col.render) return `<td class="${col.num ? 'num' : ''}">${col.render(p)}</td>`;
  let v = vsValue(p, col, pos);
  if (col.name) return `<td class="pname">${v ? escHtml(v) : '?'}</td>`;
  if (col.fmt) v = col.fmt(v);
  return `<td class="${col.num ? 'num' : ''} ${col.tdCls ? col.tdCls(p) : ''}">${v == null || v === '' ? '–' : escHtml(String(v))}</td>`;
}
function vsTopRows(players, col, pos, sort, limit) {
  const count = Math.max(0, Math.floor(Number(limit) || 0));
  if (!count) return [];
  const dir = sort.dir === 1 ? 1 : -1, top = [];
  const compare = (a, b) => {
    if (a.value == null) return b.value == null ? a.index - b.index : 1;
    if (b.value == null) return -1;
    const order = typeof a.value === 'number' && typeof b.value === 'number'
      ? a.value - b.value : String(a.value).localeCompare(String(b.value));
    return order * dir || a.index - b.index;
  };
  let index = 0;
  for (const p of players) {
    const item = { p, value: vsValue(p, col, pos), index: index++ };
    let low = 0, high = top.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (compare(item, top[middle]) < 0) high = middle; else low = middle + 1;
    }
    if (low < count) {
      top.splice(low, 0, item);
      if (top.length > count) top.pop();
    }
  }
  return top.map(item => item.p);
}
function vsPlayerTableFull(players, pos, title, kind, limit) {
  const cols = vsActiveCols(), id = 'shared';
  const saved = state.vsSorts[id];
  const sort = saved && typeof saved === 'object' ? saved : { key: 'meta', dir: -1 };
  const col = cols.find(c => c.key === sort.key) || cols.find(c => c.key === 'meta');
  const rows = vsTopRows(players, col, pos, sort, limit);
  const widths = cols.map(c => state.vsColW[c.key] || c.w || 90);
  const colgroup = `<colgroup>${cols.map((c, i) => `<col data-vs-key="${c.key}" style="width:${widths[i]}px">`).join('')}</colgroup>`;
  const heads = cols.map(c => `<th ${kind === 'club' ? `data-vs-col="${c.key}"` : ''} class="${c.num ? 'num ' : ''}${c.key === sort.key ? 'sorted' : ''}">${colLabel(c)}${c.key === sort.key ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}${kind === 'club' ? '<span class="vs-col-resize"></span>' : ''}</th>`).join('');
  const body = rows.length ? rows.map(p => `<tr data-vs-player="${p.id}">${cols.map(c => vsCell(p, c, pos)).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="vs-empty">–</td></tr>`;
  return `<div class="vs-table-box"><div class="vs-table-head"><b>${escHtml(title)}</b></div><div class="vs-table-scroll"><table class="vs-table" style="width:${widths.reduce((a, b) => a + b, 0)}px" data-vs-pos="${pos}" data-vs-kind="${kind}">${colgroup}<thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}
function vsFormationLabel() {
  if (state.bestXiFormation !== 'custom' && state.bestXiFormation !== 'custom_active') return state.bestXiFormation;
  const all = vsFormation().flatMap(slotFmPositions), seen = new Set();
  return all.filter(pos => { if (seen.has(pos)) return false; seen.add(pos); return true; }).map(pos => {
    const n = all.filter(x => x === pos).length; return n > 1 ? `${pos} ×${n}` : pos;
  }).join(' · ');
}
function renderVsColumnWidth(key) {
  const cols = vsActiveCols();
  const width = state.vsColW[key] || cols.find(c => c.key === key)?.w || 90;
  document.querySelectorAll(`.vs-table col[data-vs-key="${key}"]`).forEach(col => { col.style.width = width + 'px'; });
  const total = cols.reduce((sum, c) => sum + (state.vsColW[c.key] || c.w || 90), 0);
  document.querySelectorAll('.vs-table').forEach(table => { table.style.width = total + 'px'; });
}
function renderVsShortlist(squad) {
  const clubIds = new Set(squad.map(p => p.id));
  const shortlist = state.players.filter(p => state.shortlist.has(p.id) && !clubIds.has(p.id));
  const positions = vsPositionSlots().map(pos => {
    const clubCount = Math.max(0, Number(state.vsClubCounts[pos] ?? 5)), shortlistCount = Math.max(0, Number(state.vsShortlistCounts[pos] ?? 5));
    return `<article class="vs-position"><div class="vs-position-head"><h3>${pos}</h3><div class="vs-limits">
      <label>${escHtml(t('anPlayers'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
      <label>${escHtml(t('shortlist'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
    </div></div><div class="vs-tables">${vsPlayerTableFull(squad.filter(p => vsMeetsProficiency(p, pos)), pos, t('c_club'), 'club', clubCount)}${vsPlayerTableFull(shortlist.filter(p => vsMeetsProficiency(p, pos)), pos, t('shortlist'), 'shortlist', shortlistCount)}</div></article>`;
  }).join('');
  return `<section class="vs-shortlist"><div class="vs-head"><div><h2>${escHtml(t('vsTitle'))}</h2><p>${escHtml(t('vsDescription'))}</p><div class="vs-formation">${escHtml(t('vsFormation'))}: <b>${escHtml(vsFormationLabel())}</b> <span>· ${escHtml(t('vsFormationHint'))}</span></div></div><label>${escHtml(t('profThresholdLabel'))} <input id="vs-prof-threshold" type="number" min="1" max="20" value="${state.vsProfThreshold}"></label></div>${positions}</section>`;
}

// Layout wrapper: Club controls this shared table configuration in either view.
function renderVsShortlist(squad, shortlist) {
  const selectedTeams = vsSelectedTeamGroups();
  const positionSlots = vsPositionSlots();
  const clubByPosition = vsPlayersByPosition(squad, positionSlots, state.vsProfThreshold, selectedTeams);
  const shortlistByPosition = vsPlayersByPosition(shortlist, positionSlots, state.vsProfThreshold, selectedTeams);
  const positionCards = positionSlots.map(pos => {
    const clubCount = Math.max(0, Number(state.vsClubCounts[pos] ?? 5)), shortlistCount = Math.max(0, Number(state.vsShortlistCounts[pos] ?? 5));
    return `<article class="vs-position"><div class="vs-position-head"><h3>${pos}</h3><div class="vs-limits">
      <label>${escHtml(t('anPlayers'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
      <label>${escHtml(t('shortlist'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
    </div></div><div class="vs-tables">${vsPlayerTableFull(clubByPosition.get(pos), pos, t('c_club'), 'club', clubCount)}${vsPlayerTableFull(shortlistByPosition.get(pos), pos, t('shortlist'), 'shortlist', shortlistCount)}</div></article>`;
  }).join('');
  const positions = positionCards;
  const layoutLabel = state.vsLayout === 'side' ? t('vsLayoutStack') : t('vsLayoutSide');
  return `<section class="vs-shortlist ${state.vsLayout === 'side' ? 'vs-side' : ''}"><div class="vs-head"><div><h2>${escHtml(t('vsTitle'))}</h2><p>${escHtml(t('vsDescription'))}</p><div class="vs-formation">${escHtml(t('vsFormation'))}: <b>${escHtml(vsFormationLabel())}</b> <span>· ${escHtml(t('vsFormationHint'))}</span></div></div><div class="vs-controls"><label>${escHtml(t('profThresholdLabel'))} <input id="vs-prof-threshold" type="number" min="1" max="20" value="${state.vsProfThreshold}"></label><button id="vs-layout-toggle" type="button">${layoutLabel}</button></div></div>${positions}</section>`;
}

function renderVsTeamFilters() {
  return renderTeamGroupFilters('vs-team-filter', vsSelectedTeamGroups());
}

function openVsColMenu(x, y) {
  const old = $('vs-colmenu'); if (old) old.remove();
  const cfg = vsColConfig(), hidden = new Set(cfg.hidden), menu = document.createElement('div');
  menu.id = 'vs-colmenu'; menu.className = 'colmenu';
  menu.innerHTML = `<div class="cm-head">${t('colsTitle')}</div>` + PLAYER_COLS.filter(c => !c.star).map(c => `<label class="cm-row"><input type="checkbox" data-k="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${colLabel(c)}</label>`).join('');
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px'; menu.style.top = Math.min(y, window.innerHeight - 340) + 'px'; document.body.appendChild(menu);
  menu.querySelectorAll('input').forEach(input => input.onchange = () => { const h = new Set(vsColConfig().hidden); input.checked ? h.delete(input.dataset.k) : h.add(input.dataset.k); state.vsColCfg.hidden = [...h]; localStorage.setItem('fmss_vs_cols', JSON.stringify(state.vsColCfg)); menu.remove(); renderAnalysis(); });
}
document.addEventListener('click', e => { if (!e.target.closest('#vs-colmenu')) { const menu = $('vs-colmenu'); if (menu) menu.remove(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const menu = $('vs-colmenu'); if (menu) menu.remove(); } });

function legacyRenderAnalysis() {
  const box = $('analysis');
  const data = analyseSquad();
  if (!data) { box.innerHTML = `<div class="an-empty">${t('anNoClub')}</div>`; return; }
  const { squad, groups } = data;
  const needs = groups.filter(x => x.rec).sort((a, b) => b.prio - a.prio);
  const topNeed = needs[0];
  const statusLabel = { ok: t('anOk'), thin: t('anThin'), short: t('anShort') };

  const caTile = state.hideCapa ? '' :
    `<div class="an-sum-item"><span class="an-sum-n">${Math.round(avg(squad.map(p => p.ca || 0)))}</span><span class="an-sum-l">${t('anAvgCa')}</span></div>`;
  const summary = `<div class="an-summary">
    <div class="an-sum-item"><span class="an-sum-n">${squad.length}</span><span class="an-sum-l">${t('anSquadSize')}</span></div>
    ${caTile}
    <div class="an-sum-item"><span class="an-sum-n">${avg(squad.map(p => getAge(p)).filter(Boolean)).toFixed(1)}</span><span class="an-sum-l">${t('anAvgAge')}</span></div>
    <div class="an-sum-item need"><span class="an-sum-l">${t('anBiggestNeed')}</span><span class="an-sum-need">${topNeed ? topNeed.g.label[state.lang] || topNeed.g.label.en : '–'}</span></div>
  </div>`;

  const cards = groups.map(x => {
    const st = x.aging ? 'aging' : x.status;
    const badge = x.status === 'short' ? `<span class="an-badge red">${t('anShort')}</span>`
      : x.aging ? `<span class="an-badge amber">${t('anAging')}</span>`
        : (!x.succ && x.count) ? `<span class="an-badge amber">${t('anNoSucc')}</span>`
          : x.status === 'thin' ? `<span class="an-badge amber">${t('anThin')}</span>`
            : `<span class="an-badge green">${t('anOk')}</span>`;
    const dots = Array.from({ length: x.g.target }, (_, i) =>
      `<span class="dot ${i < x.count ? 'on' : ''}"></span>`).join('');
    const depthDots = dots + (x.count > x.g.target ? `<span class="dot-extra">+${x.count - x.g.target}</span>` : '');
    const yt = x.youngTalents[0];
    return `<div class="an-card ${st}">
      <div class="an-card-top"><span class="an-pos">${x.g.label[state.lang] || x.g.label.en}</span>${badge}</div>
      <div class="an-depth" data-tip="${x.count}/${x.g.target}">${depthDots}</div>
      <div class="an-stats">
        <span><b>${x.count}</b> ${t('anPlayers')}</span>
        ${state.hideCapa ? '' : `<span><b>${Math.round(x.avgCa)}</b> ${t('anAvgCa')}</span>
        <span><b>${x.bestCa}</b> ${t('anTopCa')}</span>`}
        <span><b>${x.avgAge ? x.avgAge.toFixed(0) : '–'}</b> ${t('anAvgAge')}</span>
      </div>
      <div class="an-young">${t('anYoungTalent')}: ${yt ? `${escHtml(yt.name)} <span class="dim">(${getAge(yt)}${state.hideCapa ? '' : `, PA ${yt.pa || '·'}`})</span>` : t('anNone')}</div>
      ${x.rec ? `<div class="an-rec">${x.rec}</div>` : ''}
      ${x.scout ? `<button class="an-scout" data-grp="${x.g.id}">${t('anScout')} ${icon('arrowRight', 11)}</button>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = `<div class="an-head"><h2>${t('anTitle')}</h2></div>${summary}<div class="an-grid">${cards}</div>${renderVsShortlist(squad)}`;
  box.querySelector('.vs-controls').insertAdjacentHTML('afterbegin', renderVsTeamFilters());
  box.querySelectorAll('.an-scout').forEach(b => b.onclick = () => {
    const grp = groups.find(x => x.g.id === b.dataset.grp);
    if (grp && grp.scout) scoutFor(grp.scout);
  });
  box.querySelectorAll('.vs-team-filter').forEach(input => input.onchange = e => {
    const selected = vsSelectedTeamGroups();
    if (e.target.checked) selected.add(e.target.dataset.vsTeam);
    else selected.delete(e.target.dataset.vsTeam);
    state.vsTeamFilter = [...selected];
    try { localStorage.setItem('fmss_vs_team_filter', JSON.stringify(state.vsTeamFilter)); } catch { }
    renderAnalysis();
  });
  box.querySelector('#vs-prof-threshold').onchange = e => {
    state.vsProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    try { localStorage.setItem('fmss_vs_prof_threshold', state.vsProfThreshold); } catch { }
    renderAnalysis();
  };
  box.querySelector('#vs-layout-toggle').onclick = () => {
    state.vsLayout = state.vsLayout === 'side' ? 'stack' : 'side';
    try { localStorage.setItem('fmss_vs_layout', state.vsLayout); } catch { }
    renderAnalysis();
  };
  box.querySelectorAll('.vs-count').forEach(input => input.onchange = e => {
    const target = e.target.dataset.vsKind === 'club' ? state.vsClubCounts : state.vsShortlistCounts;
    target[e.target.dataset.vsPos] = Math.max(0, Math.min(99, Number(e.target.value) || 0));
    try { localStorage.setItem(e.target.dataset.vsKind === 'club' ? 'fmss_vs_club_counts' : 'fmss_vs_shortlist_counts', JSON.stringify(target)); } catch { }
    renderAnalysis();
  });
  box.querySelectorAll('.vs-table th[data-vs-col]').forEach(th => th.onclick = () => {
    const id = 'shared', old = state.vsSorts[id];
    const current = old && typeof old === 'object' ? old : { key: 'meta', dir: -1 };
    state.vsSorts[id] = { key: th.dataset.vsCol, dir: current.key === th.dataset.vsCol ? -current.dir : (['name', 'pos', 'club', 'nat'].includes(th.dataset.vsCol) ? 1 : -1) };
    try { localStorage.setItem('fmss_vs_sorts', JSON.stringify(state.vsSorts)); } catch { }
    renderAnalysis();
  });
  box.querySelectorAll('.vs-table[data-vs-kind="club"] thead').forEach(head => head.oncontextmenu = e => { e.preventDefault(); openVsColMenu(e.clientX, e.clientY); });
  box.querySelectorAll('.vs-col-resize').forEach(grip => grip.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    const th = grip.closest('th'), key = th.dataset.vsCol, startX = e.clientX, startW = th.getBoundingClientRect().width;
    const move = ev => { state.vsColW[key] = Math.max(40, Math.round(startW + ev.clientX - startX)); renderVsColumnWidth(key); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); try { localStorage.setItem('fmss_vs_colw', JSON.stringify(state.vsColW)); } catch { } renderAnalysis(); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  box.querySelectorAll('[data-vs-player]').forEach(row => row.onclick = e => {
    const player = state.players.find(p => String(p.id) === row.dataset.vsPlayer);
    if (player) showDetail(player);
  });
}
function analysisMetricStats(players, getter) {
  let min = Infinity, max = -Infinity, total = 0, count = 0;
  for (const player of players) {
    const raw = getter(player);
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value); max = Math.max(max, value); total += value; count++;
  }
  return count ? { min, average: total / count, max } : null;
}
function analysisMetricText(key, value, ageDecimals = true) {
  if (value == null) return '–';
  if (key === 'meta' || key === 'metapa') return fmtMeta(value);
  if (key === 'age') return ageDecimals ? value.toFixed(1) : Math.round(value).toLocaleString(uiLocale());
  return Math.round(value).toLocaleString(uiLocale());
}
function analysisCardMetrics(pos) {
  return [
    { key: 'ca', label: 'CA', hidden: state.hideCapa, get: player => player.ca > 0 ? player.ca : null },
    { key: 'pa', label: 'PA', hidden: state.hideCapa, get: player => player.pa > 0 ? player.pa : null },
    { key: 'meta', label: t('c_meta'), hidden: state.hideMeta, get: player => vsScoreForPosition(player, pos) },
    { key: 'metapa', label: t('c_metapa'), hidden: state.hideMeta || state.hideCapa, get: player => vsPotentialScoreForPosition(player, pos) },
    { key: 'age', label: t('c_age'), hidden: false, get: player => getAge(player) > 0 ? getAge(player) : null },
  ].filter(metric => !metric.hidden);
}
function renderAnalysisCardPlayers(players, pos, metrics) {
  const savedSort = state.anCardSort && typeof state.anCardSort === 'object' ? state.anCardSort : {};
  const sortKey = ['name', ...metrics.map(metric => metric.key)].includes(savedSort.key) ? savedSort.key : 'age';
  const sortDir = savedSort.dir === 1 ? 1 : -1;
  const columns = [{ key: 'name', label: t('c_name') }, ...metrics.map(metric => ({ key: metric.key, label: metric.label, metric }))];
  const valueFor = (player, column) => column.key === 'name' ? (player.name || '') : column.metric.get(player);
  const rows = players.slice().sort((a, b) => {
    const column = columns.find(item => item.key === sortKey);
    const av = valueFor(a, column), bv = valueFor(b, column);
    if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
    if (bv == null || bv === '') return -1;
    const result = sortKey === 'name'
      ? String(av).localeCompare(String(bv), uiLocale())
      : (Number(av) || 0) - (Number(bv) || 0);
    return result * sortDir;
  });
  const heads = columns.map(column => {
    const sorted = column.key === sortKey;
    const arrow = sorted ? (sortDir < 0 ? ' ▼' : ' ▲') : '';
    return `<th data-an-sort="${column.key}" class="${column.key !== 'name' ? 'num ' : ''}${sorted ? 'sorted' : ''}">${escHtml(column.label)}${arrow}</th>`;
  }).join('');
  const body = rows.map(player => `<tr data-an-player="${Number(player.id) || 0}">${columns.map(column => {
    if (column.key === 'name') return `<td class="an-player-name">${escHtml(player.name || '?')}</td>`;
    return `<td class="num">${analysisMetricText(column.key, valueFor(player, column), false)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="an-player-table-wrap"><table class="an-player-table"><thead><tr>${heads}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="an-player-empty">—</td></tr>`}</tbody></table></div>`;
}
function renderAnalysis() {
  const box = $('analysis');
  const data = analyseSquad();
  if (!data) { box.innerHTML = `<div class="an-empty">${t('anNoClub')}</div>`; return; }
  const { squad, shortlist } = data;
  const analysisTeams = analysisSelectedTeamGroups();
  const positions = vsPositionSlots();
  const squadByPosition = vsPlayersByPosition(squad, positions, state.anProfThreshold, analysisTeams);
  const filteredSquad = squad.filter(player => vsTeamFilterMatches(player, analysisTeams));
  const avgCa = analysisMetricStats(filteredSquad, player => player.ca > 0 ? player.ca : null);
  const avgAge = analysisMetricStats(filteredSquad, player => getAge(player) > 0 ? getAge(player) : null);
  const summary = `<div class="an-summary">
    <div class="an-sum-item"><span class="an-sum-n">${filteredSquad.length}</span><span class="an-sum-l">${t('anSquadSize')}</span></div>
    ${state.hideCapa ? '' : `<div class="an-sum-item"><span class="an-sum-n">${analysisMetricText('ca', avgCa?.average)}</span><span class="an-sum-l">${t('anAvgCa')}</span></div>`}
    <div class="an-sum-item"><span class="an-sum-n">${analysisMetricText('age', avgAge?.average)}</span><span class="an-sum-l">${t('anAvgAge')}</span></div>
  </div>`;
  const cards = positions.map(pos => {
    const players = squadByPosition.get(pos) || [];
    const metrics = analysisCardMetrics(pos);
    const rows = metrics.map(metric => {
      const values = analysisMetricStats(players, metric.get);
      return `<div class="an-metric-row"><span class="an-metric-label">${escHtml(metric.label)}</span><span>${analysisMetricText(metric.key, values?.average)}</span><span>${analysisMetricText(metric.key, values?.min, false)}</span><span>${analysisMetricText(metric.key, values?.max, false)}</span></div>`;
    }).join('');
    return `<article class="an-card"><div class="an-card-top"><span class="an-pos">${pos}</span></div>
      <div class="an-player-total"><b>${players.length}</b><span>${t('anPlayerTotal')}</span></div>
      <div class="an-metric-table"><div class="an-metric-row an-metric-head"><span></span><span>${t('anAverage')}</span><span>${t('anLowest')}</span><span>${t('anHighest')}</span></div>${rows}</div>
      ${renderAnalysisCardPlayers(players, pos, metrics)}
    </article>`;
  }).join('');

  const cardControls = `<div class="an-card-controls">${renderTeamGroupFilters('an-team-filter', analysisTeams)}<label class="an-prof-filter">${escHtml(t('profThresholdLabel'))}<input id="an-prof-threshold" type="number" min="1" max="20" value="${state.anProfThreshold}"></label></div>`;
  box.innerHTML = `<div class="an-head"><h2>${t('anTitle')}</h2>${cardControls}</div>${summary}<div class="an-grid">${cards}</div>${renderVsShortlist(squad, shortlist)}`;
  box.querySelector('.vs-controls').insertAdjacentHTML('afterbegin', renderVsTeamFilters());
  box.querySelectorAll('.an-team-filter').forEach(input => input.onchange = e => {
    const selected = analysisSelectedTeamGroups();
    if (e.target.checked) selected.add(e.target.dataset.vsTeam);
    else selected.delete(e.target.dataset.vsTeam);
    state.anTeamFilter = [...selected];
    try { localStorage.setItem('fmss_an_team_filter', JSON.stringify(state.anTeamFilter)); } catch { }
    renderAnalysis();
  });
  box.querySelector('#an-prof-threshold').onchange = e => {
    state.anProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    e.target.value = state.anProfThreshold;
    try { localStorage.setItem('fmss_an_prof_threshold', String(state.anProfThreshold)); } catch { }
    renderAnalysis();
  };
  box.querySelectorAll('.an-player-table th[data-an-sort]').forEach(th => th.onclick = () => {
    const key = th.dataset.anSort, current = state.anCardSort || { key: 'ca', dir: -1 };
    state.anCardSort = { key, dir: current.key === key ? -current.dir : (key === 'name' ? 1 : -1) };
    try { localStorage.setItem('fmss_an_card_sort', JSON.stringify(state.anCardSort)); } catch { }
    renderAnalysis();
  });
  box.querySelectorAll('.vs-team-filter').forEach(input => input.onchange = e => {
    const selected = vsSelectedTeamGroups();
    if (e.target.checked) selected.add(e.target.dataset.vsTeam);
    else selected.delete(e.target.dataset.vsTeam);
    state.vsTeamFilter = [...selected];
    try { localStorage.setItem('fmss_vs_team_filter', JSON.stringify(state.vsTeamFilter)); } catch { }
    renderAnalysis();
  });
  box.querySelector('#vs-prof-threshold').onchange = e => {
    state.vsProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    try { localStorage.setItem('fmss_vs_prof_threshold', state.vsProfThreshold); } catch { }
    renderAnalysis();
  };
  box.querySelector('#vs-layout-toggle').onclick = () => {
    state.vsLayout = state.vsLayout === 'side' ? 'stack' : 'side';
    try { localStorage.setItem('fmss_vs_layout', state.vsLayout); } catch { }
    renderAnalysis();
  };
  box.querySelectorAll('.vs-count').forEach(input => input.onchange = e => {
    const target = e.target.dataset.vsKind === 'club' ? state.vsClubCounts : state.vsShortlistCounts;
    target[e.target.dataset.vsPos] = Math.max(0, Math.min(99, Number(e.target.value) || 0));
    try { localStorage.setItem(e.target.dataset.vsKind === 'club' ? 'fmss_vs_club_counts' : 'fmss_vs_shortlist_counts', JSON.stringify(target)); } catch { }
    renderAnalysis();
  });
  box.querySelectorAll('.vs-table th[data-vs-col]').forEach(th => th.onclick = () => {
    const id = 'shared', old = state.vsSorts[id];
    const current = old && typeof old === 'object' ? old : { key: 'meta', dir: -1 };
    state.vsSorts[id] = { key: th.dataset.vsCol, dir: current.key === th.dataset.vsCol ? -current.dir : (['name', 'pos', 'club', 'nat'].includes(th.dataset.vsCol) ? 1 : -1) };
    try { localStorage.setItem('fmss_vs_sorts', JSON.stringify(state.vsSorts)); } catch { }
    renderAnalysis();
  });
  box.querySelectorAll('.vs-table[data-vs-kind="club"] thead').forEach(head => head.oncontextmenu = e => { e.preventDefault(); openVsColMenu(e.clientX, e.clientY); });
  box.querySelectorAll('.vs-col-resize').forEach(grip => grip.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    const th = grip.closest('th'), key = th.dataset.vsCol, startX = e.clientX, startW = th.getBoundingClientRect().width;
    const move = ev => { state.vsColW[key] = Math.max(40, Math.round(startW + ev.clientX - startX)); renderVsColumnWidth(key); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); try { localStorage.setItem('fmss_vs_colw', JSON.stringify(state.vsColW)); } catch { } renderAnalysis(); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  box.querySelectorAll('[data-vs-player]').forEach(row => row.onclick = e => {
    const player = state.players.find(p => String(p.id) === row.dataset.vsPlayer);
    if (player) showDetail(player);
  });
  box.querySelectorAll('[data-an-player]').forEach(row => row.onclick = () => {
    const player = state.players.find(p => Number(p.id) === Number(row.dataset.anPlayer));
    if (player) showDetail(player);
  });
}

// Zet filters + veld op de gevraagde behoefte en spring naar het Spelers-tabblad.
function scoutFor(s) {
  setMode('players');
  $('btn-clear').onclick();                 // schone lei
  activePos.clear();
  const codes = new Set(s.pos);
  document.querySelectorAll('.pos-node').forEach(n => { if (codes.has(n.dataset.pos)) { activePos.add(n.dataset.pos); n.classList.add('on'); } });
  if (s.minPa) $('f-pa-min').value = s.minPa;
  if (s.maxAge) $('f-age-max').value = s.maxAge;
  applyFilters();
  showToast([...codes].join(', '), 'search');
}
$('detail-close').onclick = closeDetail;
$('detail-backdrop').onclick = closeDetail;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// ---------- UI-bediening ----------
['f-name', 'f-age-min', 'f-age-max', 'f-ca-min', 'f-ca-max', 'f-pa-min', 'f-pa-max', 'f-meta-min', 'f-meta-max', 'f-metapa-min', 'f-metapa-max', 'f-growth-min', 'f-growth-max', 'f-height-min', 'f-height-max', 'f-price', 'f-fee', 'f-wage', 'f-nat'].forEach(id => {
  let tm; $(id).addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(applyFilters, 150); });
});
['f-eu', 'f-tstatus', 'f-contract', 'f-shortlist', 'f-wonderkid', 'f-foot', 'f-new'].forEach(id => $(id).addEventListener('change', applyFilters));
$('f-myclub').addEventListener('change', () => {
  if (state.mode === 'myplayer' && !$('f-myclub').checked) setMode('players');
  else applyFilters();
});
$('f-meta-group').addEventListener('change', () => {
  state.metaViewPos = $('f-meta-group').value || null;
  localStorage.setItem('fmss_metaviewpos', state.metaViewPos || '');
  for (const p of state.players) { delete p._meta; delete p._metaPa; delete p._metaGroup; }
  applyFilters();
});
$('f-hist-period').addEventListener('change', async () => {
  await setHistPeriod($('f-hist-period').value);
  renderTable();     // groeikolom leest andere peildata
  applyFilters();
});
$('btn-adv').onclick = advDialog;
$('f-staffrole').addEventListener('change', applyFilters);
$('f-staff-recruitable').addEventListener('change', applyFilters);
$('f-gender').addEventListener('change', applyFilters);
// Player and club league filters share the same fast, keyboard-accessible suggestions.
bindCompetitionSuggest('f-div', 'div-suggest', () => state.divIndex || [], applyFilters);
bindCompetitionSuggest('club-filter-league', 'club-league-suggest', buildClubLeagueIndex, applyClubListFilters);
bindCompetitionSuggest('club-filter-nation', 'club-nation-suggest', buildClubNationIndex, applyClubListFilters);
$('f-interest').addEventListener('change', applyFilters);
$('f-role').addEventListener('change', () => {
  state.role = $('f-role').value;
  localStorage.setItem('fmss_role', state.role);
  if (state.role) { state.sortKey = 'role'; state.sortDir = -1; }        // meteen op rolscore sorteren
  else if (state.sortKey === 'role') { state.sortKey = 'ca'; state.sortDir = -1; }
  applyFilters();
  if (state.selected) showDetail(state.selected);
});

$('btn-clear').onclick = () => {
  document.querySelectorAll('#filters input[type=text], #filters input[type=number]').forEach(i => i.value = '');
  document.querySelectorAll('#filters input[type=checkbox]').forEach(i => i.checked = false);
  $('f-staff-recruitable').checked = true;
  if (state.mode === 'myplayer') $('f-myclub').checked = true;
  $('f-staffrole').value = ''; $('f-gender').value = ''; $('f-interest').value = '0'; $('f-contract').value = ''; $('f-tstatus').value = '';
  $('f-role').value = ''; state.role = '';
  state.profThreshold = 15;
  $('f-prof-threshold').value = state.profThreshold;
  localStorage.setItem('fmss_profthreshold', state.profThreshold);
  $('f-foot').value = '';
  if (state.mode === 'staff') state.advStaffF = [];
  else state.advF = [];
  saveAdv();
  activePos.clear();
  document.querySelectorAll('.pos-node').forEach(n => n.classList.remove('on'));
  state.myTeam = 'all'; renderMyTeamChips();   // subteamchip (Eerste/Jeugd) hoort ook bij "wissen"
  state.presetSel = null; renderPresets();   // dropdown-label terug naar de placeholder
  applyFilters();
};
$('btn-sidebar').onclick = () => document.body.classList.toggle('sidebar-collapsed');
$('btn-export').onclick = exportShortlist;
$('btn-export-fmf').onclick = exportShortlistFmf;
$('btn-clear-shortlist').onclick = clearShortlist;
$('btn-import-fmf').onclick = () => $('input-import-fmf').click();
$('input-import-fmf').onchange = e => importShortlistFmf(e.target.files && e.target.files[0]);
$('btn-bulk-add').onclick = addBulkToShortlist;
$('btn-bulk-cancel').onclick = clearBulkSelection;
$('btn-coffee').onclick = openKofi;
$('btn-report').onclick = reportBug;
$('es-report').onclick = reportBug;
// Handmatige update-check in Instellingen, naast de stille 20-uurs autocheck.
// Resultaat verschijnt als notitie onder de knop; een gevonden update toont
// bovendien het gewone update-pilletje in de topbar (zelfde vervolgflow).
$('btn-updcheck').onclick = async () => {
  const btn = $('btn-updcheck'), note = $('upd-note');
  btn.disabled = true;
  note.textContent = t('updChecking');
  try {
    const r = await checkUpdate(true);
    note.textContent = r && r.newer ? tf('updFound', { v: r.tag }) : tf('updNone', { v: APP_VERSION });
  } catch (e) {
    console.error('update-check:', e);
    note.textContent = t('updCheckErr');
  }
  btn.disabled = false;
};
checkUpdate();

// Ko-fi-glow: het koffie-icoon pulseert even zacht op het moment dat de tool je net iets
// heeft opgeleverd (spelerskaart opgeslagen, shortlist geexporteerd). Hooguit één keer per
// dag, 12 seconden, daarna vanzelf stil. Klikken op het icoon opent Ko-fi en dooft hem.
//
// De vorige versie hing aan een willekeurige timer 20-90 s na het opstarten en ging uit na
// vier klikken ergens in de app. In een tool waarin je constant sorteert en profielen opent
// haal je die vier binnen enkele seconden, precies in dat tijdvak: de gloed was daardoor in
// de praktijk nooit langer dan een moment zichtbaar (26-07 nagemeten).
function coffeeGlow() {
  if (kofiOff()) return;   // "vraag het niet meer" geldt ook voor de gloed
  const last = +localStorage.getItem('fmss_glow_at') || 0;
  if (Date.now() - last < 24 * 3600e3) return;
  // Nooit twee vragen tegelijk: staat het seizoensrapport open, dan blijft het icoon stil.
  const dn = $('donate-nudge');
  if (dn && !dn.classList.contains('hidden')) return;
  localStorage.setItem('fmss_glow_at', String(Date.now()));
  const btn = $('btn-coffee');
  if (!btn) return;
  btn.classList.add('glow');
  const stop = () => { btn.classList.remove('glow'); btn.removeEventListener('click', stop); };
  btn.addEventListener('click', stop);
  setTimeout(stop, 12e3);
}
// Supporter-staat (goudkleurig icoon) overleeft herstarts.
if (localStorage.getItem('fmss_supporter') === '1') $('btn-coffee').classList.add('supporter');
checkSetupState();

// inklapbare filtersecties (voorkeur onthouden)
// Eerste gebruik (geen opgeslagen stand): secundaire secties dicht zodat de zijbalk op
// één scherm past (progressive disclosure). Eigen klikgedrag wordt daarna onthouden.
const rawSecs = localStorage.getItem('fmss_secs');
const collapsedSecs = new Set(rawSecs ? JSON.parse(rawSecs) : ['presets', 'role', 'development', 'physical', 'financial', 'origin', 'availability']);
document.querySelectorAll('.fsection[data-sec]').forEach(sec => {
  const key = sec.dataset.sec;
  if (collapsedSecs.has(key)) sec.classList.add('collapsed');
  sec.querySelector('.fsec-head').addEventListener('click', () => {
    sec.classList.toggle('collapsed');
    if (sec.classList.contains('collapsed')) collapsedSecs.add(key); else collapsedSecs.delete(key);
    localStorage.setItem('fmss_secs', JSON.stringify([...collapsedSecs]));
  });
});

// '/' focust het zoekveld
document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.target.closest?.('input, select, textarea')) { e.preventDefault(); $('f-name').focus(); }
});

// ↑/↓ bladert door de rijen; het detailpaneel volgt
document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (e.target.closest?.('input, select, textarea')) return;
  if (!state.filtered.length) return;
  e.preventDefault();
  let i = state.selected ? state.filtered.indexOf(state.selected) : -1;
  i = e.key === 'ArrowDown' ? Math.min(state.filtered.length - 1, i + 1) : Math.max(0, i - 1);
  const wrap = $('table-wrap');
  const y = i * ROW_H;
  if (y < wrap.scrollTop) wrap.scrollTop = y;
  else if (y + ROW_H * 2 > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = y - wrap.clientHeight + ROW_H * 2;
  showDetail(state.filtered[i]);
});

// club-badge klik → filters wissen + mijn club aan
$('club-badge').onclick = () => {
  if (!state.meta.myClub) return;
  $('btn-clear').onclick();
  $('f-myclub').checked = true;
  renderMyTeamChips();   // programmatisch aanvinken vuurt geen change-event → chips zelf tonen
  applyFilters();
};

// valuta-dropdown
$('sel-cur').value = state.cur;
$('sel-cur').addEventListener('change', () => {
  state.cur = $('sel-cur').value;
  localStorage.setItem('fmss_cur', state.cur);
  renderVisible(); if (state.selected) showDetail(state.selected);
});
// Database-keuze (mannen/vrouwen/beide): leeft server-side (scan-config.json) zodat de
// plugin hem bij Nieuwe data leest; localStorage zou de game nooit bereiken.
fetch('/api/scan-config').then(r => r.json()).then(c => { $('sel-db').value = c.db || 'men'; }).catch(() => { });
$('sel-db').addEventListener('change', () => {
  fetch('/api/scan-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: $('sel-db').value }),
  }).then(() => showToast(t('womenNote'), 'check')).catch(() => { });
});
// salarisperiode-dropdown
$('sel-wageper').value = state.wagePer;
$('sel-wageper').addEventListener('change', () => {
  state.wagePer = $('sel-wageper').value;
  localStorage.setItem('fmss_wageper', state.wagePer);
  applyLang();   // kolomkop, filterlabel, profiel en tabel volgen de nieuwe periode
});
// taal-dropdown
$('sel-lang').value = state.lang;
$('sel-lang').addEventListener('change', () => {
  state.lang = $('sel-lang').value;
  localStorage.setItem('fmss_lang', state.lang);
  applyLang();
});
// CA/PA verbergen (anti-"spieken"). Past de hele tool consistent aan.
function applyHideCapa() {
  document.body.classList.toggle('hide-capa', state.hideCapa);
  document.body.classList.toggle('hide-meta', state.hideMeta);
  // Verborgen filters leegmaken zodat ze niet stiekem blijven filteren. CA/PA/vraagprijs
  // vallen onder de hidden-stats-toggle; meta onder zijn eigen toggle.
  if (state.hideCapa) ['f-ca-min', 'f-ca-max', 'f-pa-min', 'f-pa-max', 'f-fee', 'f-growth-min', 'f-growth-max', 'f-metapa-min', 'f-metapa-max'].forEach(id => { const e = $(id); if (e) e.value = ''; });
  if (state.hideCapa) { const n = $('f-new'); if (n) n.checked = false; }   // groei-afgeleid
  if (state.hideMeta) ['f-meta-min', 'f-meta-max', 'f-metapa-min', 'f-metapa-max'].forEach(id => { const e = $(id); if (e) e.value = ''; });
  if (hiddenStatCol(state.sortKey)) { state.sortKey = state.mode === 'staff' ? 'wage' : 'value'; state.sortDir = -1; }
  updateAdvBtn();   // regels op verborgen data tellen niet mee zolang de toggle uit staat
  renderDevSection(); renderIntakeBar();
  if (state.mode === 'analysis') renderAnalysis(); else { renderTable(); applyFilters(); }
  if (state.selected) showDetail(state.selected);
}
$('set-profile').value = profMode();
$('set-profile').addEventListener('change', () => {
  localStorage.setItem('fmss_profmode', $('set-profile').value);
  if (state.selected) showDetail(state.selected);   // open profiel meteen omzetten
});
$('set-hidemeta').checked = !state.hideMeta;   // "tonen" = niet verbergen (standaard aan)
$('set-hidemeta').addEventListener('change', () => {
  state.hideMeta = !$('set-hidemeta').checked;
  localStorage.setItem('fmss_hidemeta', state.hideMeta ? '1' : '0');
  applyHideCapa();   // deelt de her-render (kolommen, filters, profiel, analyse)
});
$('set-hidecapa').checked = !state.hideCapa;   // "tonen" = niet verbergen (standaard aan)
$('set-hidecapa').addEventListener('change', () => {
  state.hideCapa = !$('set-hidecapa').checked;
  localStorage.setItem('fmss_hidecapa', state.hideCapa ? '1' : '0');
  applyHideCapa();
});
$('btn-clear-data').onclick = async () => {
  if (!window.confirm(t('clearAllDataConfirm'))) return;
  const btn = $('btn-clear-data');
  dataClearInProgress = true;
  btn.disabled = true;
  try {
    if (historySnapshotInFlight) await historySnapshotInFlight.catch(() => {});
    const r = await fetch('/api/data/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    for (const key of ['fmss_hist_at', 'fmss_loadmark', 'fmss_shortlist', 'fmss_intake_seen',
      'fmss_season', 'fmss_season_at', 'fmss_season_base', 'fmss_season_n', 'fmss_loads']) {
      localStorage.removeItem(key);
    }
    alert(t('clearAllDataDone'));
    window.location.reload();
  } catch (e) {
    console.error('clear all data:', e);
    alert(t('clearAllDataError'));
  } finally {
    dataClearInProgress = false;
    btn.disabled = false;
  }
};
// instellingen-menu (tandwiel)
$('btn-settings').onclick = e => {
  e.stopPropagation();
  const m = $('settings-menu');
  if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  const r = $('btn-settings').getBoundingClientRect();
  m.style.top = (r.bottom + 6) + 'px';
  m.style.right = (window.innerWidth - r.right) + 'px';
  m.classList.remove('hidden');
};
document.addEventListener('click', e => {
  if (!e.target.closest('#settings-menu') && !e.target.closest('#btn-settings')) $('settings-menu').classList.add('hidden');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('settings-menu').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('weight-editor-modal')?.style.display !== 'none') closeWeightEditor(); });

// ── Meta preset UI ────────────────────────────────────────────────────────────

function updatePresetLabel() {
  const el = $('meta-preset-name');
  if (el) el.textContent = META_PRESET ? META_PRESET.name : '…';
}

// Load a preset from a JSON object, persist it, refresh scores, re-render.
function loadAndApplyPreset(data) {
  try {
    applyMetaPreset(data);
    try { localStorage.setItem('fmss_meta_preset', JSON.stringify(data)); } catch {}
    updatePresetLabel();
    populateMetaGroupSelect();
    renderTable();
  } catch (e) {
    console.error('Meta preset toepassen mislukt:', e);
    alert(`${t('presetLoadError')}: ${e.message}`);
  }
}

// File picker: user selects a .json file
$('meta-preset-file').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      loadAndApplyPreset(JSON.parse(ev.target.result));
    } catch (e) {
      alert(`${t('presetInvalidFile')}: ${e.message}`);
    }
  };
  reader.readAsText(file);
  this.value = '';   // reset so the same file can be re-selected
});

$('meta-preset-load-btn').onclick = () => $('meta-preset-file').click();

$('meta-preset-reset-btn').onclick = async () => {
  try {
    const r = await fetch('/meta-presets/default_direct.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    loadAndApplyPreset(await r.json());
  } catch {
    // Network/file not found — fall back to built-in preset
    localStorage.removeItem('fmss_meta_preset');
    applyMetaPreset(BUILTIN_PRESET);
    updatePresetLabel();
    renderTable();
  }
};

$('meta-preset-edit-btn').onclick = () => openWeightEditor();

// ── Weight editor ─────────────────────────────────────────────────────────────

let _weActiveTab = '';
// _weSegments[g][attr] = [{from, to, pts}, ...] sorted descending by from (ceiling first)
let _weSegments = {};

// All FM attributes grouped by category, used to populate every position tab.
const WE_OUTFIELD_SECTIONS = [
  { label: 'Technical', color: '#7dd3fc', attrs: ['Corners', 'Crossing', 'Dribbling', 'Finishing', 'FirstTouch', 'FreeKicks', 'Heading', 'LongShots', 'LongThrows', 'Marking', 'Passing', 'PenaltyTaking', 'Tackling', 'Technique'] },
  { label: 'Mental',    color: '#a5b4fc', attrs: ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision', 'WorkRate'] },
  { label: 'Physical',  color: '#86efac', attrs: ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength'] },
  { label: 'Hidden',    color: '#fca5a5', attrs: ['Consistency', 'ImportantMatches', 'InjuryProneness', 'Versatility', 'Dirtiness'] },
];
const WE_GK_SECTIONS = [
  { label: 'Goalkeeping', color: '#fdba74', attrs: ['AerialReach', 'CommandOfArea', 'Communication', 'Eccentricity', 'FirstTouch', 'Handling', 'Kicking', 'OneOnOnes', 'Passing', 'Punching', 'Reflexes', 'RushingOut', 'Technique', 'Throwing'] },
  { label: 'Mental',      color: '#a5b4fc', attrs: ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision', 'WorkRate'] },
  { label: 'Physical',    color: '#86efac', attrs: ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength'] },
  { label: 'Hidden',      color: '#fca5a5', attrs: ['Consistency', 'ImportantMatches', 'InjuryProneness', 'Versatility', 'Dirtiness'] },
];

const WE_SECTION_I18N = {
  Technical: 'weTechnical', Mental: 'weMental', Physical: 'wePhysical',
  Hidden: 'weHidden', Goalkeeping: 'weGoalkeeping',
};
const weSectionLabel = label => t(WE_SECTION_I18N[label] || label);

// Localized label for any attr (including hidden attrs which live in the i18n object under 'a_*').
function weAttrLabel(a) {
  const map = ATTR_LABEL[state.lang] || ATTR_LABEL.en;
  if (map[a]) return map[a];
  // Hidden attrs
  const hi18n = { Consistency: 'a_Consistency', ImportantMatches: 'a_ImportantMatches', InjuryProneness: 'a_InjuryProneness', Versatility: 'a_Versatility', Dirtiness: 'a_Dirtiness' };
  return hi18n[a] ? t(hi18n[a]) : a;
}

// ── Piecewise segment helpers ─────────────────────────────────────────────────

// Enforce ceiling=20, floor=1, derive all 'to' values from adjacent 'from' values.
function weNormalizeSegs(segs) {
  if (!segs || !segs.length) return [{ from: 1, to: 20, pts: 0 }];
  const s = [...segs].sort((a, b) => b.from - a.from);
  s[0].to = 20;                                          // ceiling always locked
  for (let i = 1; i < s.length; i++) s[i].to = s[i - 1].from - 1;  // derive all to's
  // floor NOT forced to 1 — bottom segment keeps its actual FROM (the test start)
  return s;
}

// Build the innerHTML for one attribute's segment rows (used both on init and on update).
// g/attr may be '' for the proficiency special case (uses weProfPtsChange / weProfBreakpoint).
function weBuildSegRows(g, attr, segs, scale, opts) {
  opts = opts || {};
  const isProficiency = opts.isProficiency || false;
  const N = segs.length;
  const inpS = 'padding:1px 3px;background:#0f172a;border:1px solid #1e293b;color:#94a3b8;border-radius:3px;font-size:11px;text-align:center;box-sizing:border-box;width:27px;';

  let rows = segs.map((seg, i) => {
    const isFirst = i === 0, isLast = i === N - 1;
    const range = seg.to - seg.from;
    const coeff = range > 0 ? (seg.pts / (scale * range)).toFixed(4) : '—';
    const cc = seg.pts > 0 ? '#34d399' : seg.pts < 0 ? '#f87171' : '#475569';

    // FROM: editable unless it literally equals 1 (can't go below floor)
    // onchange (not oninput) so multi-digit numbers can be typed without mid-input clamping
    const fromLocked = seg.from === 1;
    const fromCell = fromLocked
      ? `<span style="${inpS}display:inline-block;color:#475569;">1</span>`
      : isProficiency
        ? `<input type="number" value="${seg.from}" min="1" max="20" step="1"
             style="${inpS}" onchange="weProfBreakpointChange(${i},this.value)">`
        : `<input type="number" value="${seg.from}" min="1" max="20" step="1"
             style="${inpS}" onchange="weBreakpointChange('${g}','${attr}',${i},this.value)">`;

    // TO: ceiling (20) locked for first; auto-derived for others
    const toCell = isFirst
      ? `<span style="${inpS}display:inline-block;color:#475569;">20</span>`
      : `<span style="${inpS}display:inline-block;color:#334155;">${seg.to}</span>`;

    const ptsOninput = isProficiency
      ? `weProfPtsChange(${i},this.value)`
      : `wePtsChange('${g}','${attr}',${i},this.value)`;
    const rmOninput = isProficiency
      ? `weProfRemoveSeg(${i})`
      : `weRemoveSeg('${g}','${attr}',${i})`;
    const rmBtn = N > 1
      ? `<button onclick="${rmOninput}"
           style="padding:0 4px;line-height:1.3;background:none;border:1px solid #334155;color:#64748b;border-radius:3px;font-size:10px;cursor:pointer;" title="${t('removeSegment')}">×</button>`
      : '<span style="display:inline-block;width:20px;"></span>';

    // ×2 / ÷2 slope buttons: only on non-first segments — sets this seg's pts relative to the segment above
    const btnStyle = 'padding:0 3px;line-height:1.3;background:none;border:1px solid #334155;color:#7dd3fc;border-radius:3px;font-size:9px;cursor:pointer;';
    const slopeBtns = i > 0
      ? (isProficiency
          ? `<button onclick="weProfSlopeMultiply(${i},2)"   style="${btnStyle}" title="${t('doubleSlope')}">×2</button>` +
            `<button onclick="weProfSlopeMultiply(${i},0.5)" style="${btnStyle}" title="${t('halveSlope')}">÷2</button>`
          : `<button onclick="weSlopeMultiply('${g}','${attr}',${i},2)"   style="${btnStyle}" title="${t('doubleSlope')}">×2</button>` +
            `<button onclick="weSlopeMultiply('${g}','${attr}',${i},0.5)" style="${btnStyle}" title="${t('halveSlope')}">÷2</button>`)
      : '';

    return `<div style="display:flex;align-items:center;gap:3px;padding:1px 0;">
      <input type="number" class="${isProficiency ? 'we-prof-pts' : 'we-pts'}"
        ${isProficiency ? '' : `data-we-group="${g}" data-attr="${attr}"`}
        data-scale="${scale}" data-seg="${i}"
        value="${seg.pts}" step="0.5" oninput="${ptsOninput}"
        style="width:54px;padding:2px 4px;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:4px;font-size:12px;text-align:right;box-sizing:border-box;">
      <span style="font-size:10px;color:#475569;">pts</span>
      ${fromCell}<span style="font-size:10px;color:#334155;">→</span>${toCell}
      <span style="font-size:11px;color:${cc};font-family:monospace;min-width:44px;text-align:right;">${coeff}</span>
      ${slopeBtns}${rmBtn}
    </div>`;
  }).join('');

  // Extension note: when the bottom segment doesn't reach 1, behaviour continues downward.
  // • attrs / multi-seg prof: same coeff (piecewise clamp-integral extension)
  // • single-seg prof: legacy scalar path doubles the coeff below Accomplished (15)
  const bottom = segs[N - 1];
  if (bottom && bottom.from > 1) {
    const extRange = bottom.to - bottom.from;
    const extCoeff = extRange > 0 ? (bottom.pts / (scale * extRange)).toFixed(4) : '—';
    const noteLabel = (isProficiency && N === 1) ? tf('weightBelow', { n: 15 }) : t('weightSame');
    rows += `<div style="display:flex;align-items:center;gap:3px;padding:1px 0;opacity:0.45;font-style:italic;">
      <span style="width:54px;font-size:10px;color:#475569;text-align:right;">${noteLabel}</span>
      <span style="font-size:10px;color:#475569;margin-left:4px;">1 → ${bottom.from - 1}</span>
      <span style="font-size:10px;font-family:monospace;min-width:44px;margin-left:auto;color:#334155;">${extCoeff}</span>
      <span style="display:inline-block;width:20px;"></span>
    </div>`;
  }

  return rows;
}

// Re-render one attribute's segment rows from _weSegments state.
function weRenderAttrSegs(g, attr) {
  const box = document.getElementById(`we-segbox-${g}-${attr}`);
  if (!box) return;
  const scale = parseFloat(box.dataset.scale) || 10;
  const segs  = (_weSegments[g] || {})[attr] || [];
  box.innerHTML = weBuildSegRows(g, attr, segs, scale);
}

function weBreakpointChange(g, attr, idx, val) {
  const segs = (_weSegments[g] || {})[attr];
  if (!segs) return;
  const isLast = idx === segs.length - 1;
  // Bottom segment's from = test-range start (can be e.g. 8, min=1)
  // Interior breakpoints: must stay between adjacent segments
  const lo = isLast ? 1 : (idx + 1 < segs.length ? segs[idx + 1].from + 1 : 1);
  const hi = idx > 0 ? segs[idx - 1].from - 1 : 20;
  const v  = Math.max(lo, Math.min(hi, parseInt(val) || lo));
  segs[idx].from = v;
  // Re-derive the segment immediately below
  if (idx + 1 < segs.length) segs[idx + 1].to = v - 1;
  weRenderAttrSegs(g, attr);
}

function wePtsChange(g, attr, idx, val) {
  const segs = (_weSegments[g] || {})[attr];
  if (segs && segs[idx] != null) segs[idx].pts = parseFloat(val) || 0;
  weRenderAttrSegs(g, attr);
}

function weAddSeg(g, attr) {
  if (!_weSegments[g]) _weSegments[g] = {};
  const segs = _weSegments[g][attr];
  if (!segs || !segs.length) return;
  const last = segs[segs.length - 1];
  if (last.from > 1) {
    // Add an explicit lower segment [1, last.from-1] — the "extension" becomes editable
    segs.push({ from: 1, to: last.from - 1, pts: 0 });
  } else {
    // Bottom already at 1 — split it at midpoint
    const span = last.to - last.from;
    if (span < 1) return;
    const mid = last.from + Math.ceil(span / 2);
    segs.push({ from: 1, to: mid - 1, pts: 0 });
    last.from = mid;
  }
  _weSegments[g][attr] = weNormalizeSegs(segs);
  weRenderAttrSegs(g, attr);
}

function weRemoveSeg(g, attr, idx) {
  const segs = (_weSegments[g] || {})[attr] || [];
  if (segs.length <= 1) return;
  segs.splice(idx, 1);
  _weSegments[g][attr] = weNormalizeSegs(segs);
  weRenderAttrSegs(g, attr);
}

// ── Proficiency segment state ─────────────────────────────────────────────────
// Same piecewise model as attributes, stored module-level since there's only one proficiency.
let _weProfSegs = [];   // [{from, to, pts}, ...] sorted descending

function weRenderProfSegs() {
  const box = document.getElementById('we-prof-segbox');
  if (!box) return;
  const scale = parseFloat(box.dataset.scale) || 10;
  box.innerHTML = weBuildSegRows('', '', _weProfSegs, scale, { isProficiency: true });
}

function weProfPtsChange(idx, val) {
  if (_weProfSegs[idx] != null) _weProfSegs[idx].pts = parseFloat(val) || 0;
  weRenderProfSegs();
}

function weProfBreakpointChange(idx, val) {
  const segs = _weProfSegs;
  const isLast = idx === segs.length - 1;
  const lo = isLast ? 1 : (idx + 1 < segs.length ? segs[idx + 1].from + 1 : 1);
  const hi = idx > 0 ? segs[idx - 1].from - 1 : 20;
  const v  = Math.max(lo, Math.min(hi, parseInt(val) || lo));
  segs[idx].from = v;
  if (idx + 1 < segs.length) segs[idx + 1].to = v - 1;
  weRenderProfSegs();
}

function weProfAddSeg() {
  const segs = _weProfSegs;
  if (!segs.length) return;
  const last = segs[segs.length - 1];
  if (last.from > 1) {
    segs.push({ from: 1, to: last.from - 1, pts: 0 });
  } else {
    const span = last.to - last.from;
    if (span < 1) return;
    const mid = last.from + Math.ceil(span / 2);
    segs.push({ from: 1, to: mid - 1, pts: 0 });
    last.from = mid;
  }
  _weProfSegs = weNormalizeSegs(segs);
  weRenderProfSegs();
}

function weProfRemoveSeg(idx) {
  if (_weProfSegs.length <= 1) return;
  _weProfSegs.splice(idx, 1);
  _weProfSegs = weNormalizeSegs(_weProfSegs);
  weRenderProfSegs();
}

// Set pts of segment idx so its slope = factor × slope of segment idx-1.
// "slope" = pts per scale-unit per range-unit = pts / (scale × range).
function weSlopeMultiply(g, attr, idx, factor) {
  const segs = (_weSegments[g] || {})[attr] || [];
  if (idx < 1 || idx >= segs.length) return;
  const box = document.getElementById(`we-segbox-${g}-${attr}`);
  const scale = box ? (parseFloat(box.dataset.scale) || 10) : 10;
  const ref = segs[idx - 1];
  const refRange = ref.to - ref.from;
  if (refRange <= 0) return;
  const refCoeff = ref.pts / (scale * refRange);
  const thisRange = segs[idx].to - segs[idx].from;
  if (thisRange <= 0) return;
  segs[idx].pts = Math.round(refCoeff * factor * scale * thisRange * 100) / 100;
  weRenderAttrSegs(g, attr);
}

function weProfSlopeMultiply(idx, factor) {
  const segs = _weProfSegs;
  if (idx < 1 || idx >= segs.length) return;
  const box = document.getElementById('we-prof-segbox');
  const scale = box ? (parseFloat(box.dataset.scale) || 10) : 10;
  const ref = segs[idx - 1];
  const refRange = ref.to - ref.from;
  if (refRange <= 0) return;
  const refCoeff = ref.pts / (scale * refRange);
  const thisRange = segs[idx].to - segs[idx].from;
  if (thisRange <= 0) return;
  segs[idx].pts = Math.round(refCoeff * factor * scale * thisRange * 100) / 100;
  weRenderProfSegs();
}

function openWeightEditor() {
  const modal = $('weight-editor-modal');
  if (!modal) return;

  if (!META_PRESET) return;

  // Reset editor state
  _weSegments = {};

  const raw          = META_PRESET.raw || {};
  const posW         = raw.position_weights || {};
  const groupScale   = raw.group_scale || {};
  const profTest     = raw.proficiency_test || { points: 6, range: 5 };
  const attrRanges   = raw.attr_test_ranges || {};
  const attrFrom     = raw.attr_test_from  || {};
  const baseline     = raw.baseline ?? 8;
  const profBaseline = raw.proficiency_baseline ?? 20;
  const defaultRange = 20 - baseline;

  const profFrom = profTest.from ?? 15;
  const profTo   = profTest.to   ?? (profFrom + (profTest.range ?? 5));

  const GROUP_ORDER = ['GK','DC','FB','DM','MC','WM','AM','ST'];
  const groups = GROUP_ORDER.filter(g => posW[g]);
  if (!groups.length) return;
  const firstGroup = groups[0];
  _weActiveTab = firstGroup;

  // ── Explanation ──
  const scaleDesc = Object.entries(groupScale).map(([g,s]) => `${g}=${s}`).join(', ') || tf('weightScaleDefault', { outfield: t('weightOutfield'), goalkeeper: t('weightGoalkeeper') });
  const profRange = profTo - profFrom;
  const cpOut = profRange > 0 ? (profTest.points / (10 * profRange)).toFixed(4) : '—';
  const cpGk  = profRange > 0 ? (profTest.points / (1  * profRange)).toFixed(4) : '—';

  const explanation = `<details style="margin:0;padding:12px 20px;background:#080e1a;border-bottom:1px solid #1e293b;font-size:12px;color:#64748b;flex-shrink:0;">
    <summary style="cursor:pointer;font-weight:bold;color:#94a3b8;user-select:none;">${t('weightHow')}</summary>
    <div style="margin-top:10px;line-height:1.7;">
      <p style="margin:0 0 8px;"><strong style="color:#e2e8f0;">${t('weightPts')}</strong> = ${t('weightPtsIntro')} <strong>${t('weightTestPlayers')}</strong>, ${t('weightPtsMeasure')} <strong>${t('weightSeason')}</strong>.</p>
      <p style="margin:0 0 4px;"><strong style="color:#e2e8f0;">${t('weightPiecewise')}:</strong> ${t('weightPiecewiseIntro')} <strong style="color:#7dd3fc;">+</strong> ${t('weightPiecewiseEnd')}</p>
      <code style="display:block;background:#0f172a;border:1px solid #1e293b;padding:8px 12px;border-radius:6px;color:#7dd3fc;font-size:11px;margin:6px 0 8px;line-height:1.8;">score = Σ_segments [ (attr clamped to seg) − (baseline clamped to seg) ] × (pts ÷ (scale × (TO−FROM)))<br>      + (prof − ${profBaseline}) × (profPts ÷ (scale × (profTO−profFROM)))</code>
      <ul style="margin:4px 0 0;padding-left:18px;">
        <li><strong style="color:#e2e8f0;">${t('weightScale')}</strong> — ${scaleDesc}</li>
        <li><strong style="color:#e2e8f0;">${t('weightNegativePts')}</strong> ${t('weightAllowed')} ${escHtml(attrName('InjuryProneness'))})</li>
        <li><strong style="color:#e2e8f0;">${t('weightProficiency')}</strong> — ${t('weightNatural')} (${profBaseline}) = +0; ${t('weightPenalty')} <strong>${t('weightDoublesBelow')} (15)</strong></li>
        <li>${t('weightCurrentCoeff')}: <strong style="color:#34d399;">${cpOut}</strong> (${t('weightOutfield')}) / <strong style="color:#34d399;">${cpGk}</strong> (${t('weightGoalkeeper')})</li>
      </ul>
    </div>
  </details>`;

  // ── Baseline explanation banner ──
  const baselineBanner = `<div style="padding:7px 20px;background:#070d1a;border-bottom:1px solid #1e293b;font-size:11px;color:#64748b;flex-shrink:0;line-height:1.6;">
    <span style="color:#94a3b8;font-weight:bold;">📐 ${t('weightBaseline')}: </span>
    <strong style="color:#7dd3fc;">meta = 0</strong> → ${t('weightPlayerAt')} <strong style="color:#e2e8f0;">${baseline}</strong>.
    &nbsp;&nbsp;
    <strong style="color:#34d399;">effective_meta = 0</strong> → ${t('weightSameNatural')} (<strong style="color:#e2e8f0;">${profBaseline}</strong>).
  </div>`;

  // ── Tabs ──
  const tabsHtml = groups.map(g =>
    `<button class="we-tab-btn" data-g="${g}" onclick="weShowTab('${g}')"
      style="padding:4px 11px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;border:1px solid #334155;transition:none;
             background:${g===firstGroup?'#3b82f6':'#0f172a'};color:${g===firstGroup?'#fff':'#64748b'};border-color:${g===firstGroup?'#3b82f6':'#334155'};">${g}</button>`
  ).join('');

  // ── Attribute grids (flex-column, one per position group) ──
  function buildGrid(g) {
    const existingW = posW[g] || {};
    const scale     = groupScale[g] ?? 10;
    const sections  = g === 'GK' ? WE_GK_SECTIONS : WE_OUTFIELD_SECTIONS;
    if (!_weSegments[g]) _weSegments[g] = {};

    const colHdr = `<div style="display:flex;align-items:center;gap:6px;padding:0 0 4px;border-bottom:1px solid #1e293b;margin-bottom:4px;">
      <span style="flex:0 0 130px;font-size:10px;color:#334155;font-weight:bold;">${t('weightAttribute')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;min-width:54px;text-align:right;">${t('weightPts')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;margin-left:4px;">${t('weightFromTo')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;margin-left:auto;">${t('weightCoeff')}</span>
    </div>`;

    let rows = '';
    sections.forEach(sec => {
      rows += `<div style="font-size:9px;font-weight:bold;color:${sec.color};text-transform:uppercase;letter-spacing:.07em;padding:8px 0 3px 0;border-bottom:1px solid #1e293b;">${weSectionLabel(sec.label)}</div>`;
      sec.attrs.forEach(attr => {
        // Build initial segments from existing weight data
        const existing = existingW[attr];
        let segs;
        if (Array.isArray(existing)) {
          segs = weNormalizeSegs(existing.map(s => ({ from: s.from ?? 1, to: s.to ?? 20, pts: s.pts ?? 0 })));
        } else {
          const pts   = (typeof existing === 'number') ? existing : 0;
          const from  = attrFrom[attr] ?? baseline;
          const rng   = attrRanges[attr] ?? defaultRange;
          const to    = Math.min(20, from + rng);
          segs = weNormalizeSegs([{ from, to, pts }]);
        }
        _weSegments[g][attr] = segs;
        const segRowsHtml = weBuildSegRows(g, attr, segs, scale);

        rows += `<div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0 4px;border-bottom:1px solid #0c1829;">
          <label style="flex:0 0 130px;font-size:12px;color:#cbd5e1;padding-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(attr)}">${escHtml(weAttrLabel(attr))}</label>
          <div id="we-segbox-${g}-${attr}" data-scale="${scale}" style="flex:1;display:flex;flex-direction:column;gap:1px;">
            ${segRowsHtml}
          </div>
          <button onclick="weAddSeg('${g}','${attr}')"
            style="margin-top:4px;padding:1px 6px;background:none;border:1px solid #1e293b;color:#475569;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;" title="${t('addSegment')}">+</button>
        </div>`;
      });
    });

    return `<div class="we-grid" data-g="${g}"
      style="display:${g===firstGroup?'flex':'none'};flex-direction:column;padding:10px 0;">
      ${colHdr}${rows}
    </div>`;
  }

  const gridsHtml = groups.map(g => buildGrid(g)).join('');

  // ── Proficiency segment state init ──
  // If preset has explicit segments use them; otherwise derive from scalar test range.
  const firstScale = groupScale[groups[0]] ?? 10;
  if (profTest.segments && profTest.segments.length) {
    _weProfSegs = weNormalizeSegs(profTest.segments.map(s => ({ from: s.from ?? 1, to: s.to ?? 20, pts: s.pts ?? 0 })));
  } else {
    // Legacy single segment: show the actual tested range (profFrom → 20)
    _weProfSegs = weNormalizeSegs([{ from: profFrom, to: 20, pts: profTest.points ?? 6 }]);
  }
  const profSegHtml = weBuildSegRows('', '', _weProfSegs, firstScale, { isProficiency: true });

  // ── Proficiency row ──
  const profRow = `<div style="padding:8px 20px;background:#0a1020;border-bottom:1px solid #1e293b;flex-shrink:0;font-size:12px;color:#64748b;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="font-weight:bold;color:#94a3b8;">${t('weightProficiencyTitle')}</span>
      <span style="font-size:11px;color:#334155;">${t('weightProfLevels')}</span>
      <button onclick="weProfAddSeg()"
        style="margin-left:auto;padding:1px 6px;background:none;border:1px solid #1e293b;color:#475569;border-radius:4px;font-size:12px;cursor:pointer;" title="${t('addProficiency')}">+</button>
    </div>
    <div id="we-prof-segbox" data-scale="${firstScale}" style="display:flex;flex-direction:column;gap:1px;padding-left:4px;">
      ${profSegHtml}
    </div>
  </div>`;

  // ── Full modal ──
  modal.innerHTML = `<div style="background:#0f172a;width:100%;max-width:780px;max-height:90vh;border:1px solid #334155;border-radius:16px;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.7);overflow:hidden;">

    <div style="padding:14px 20px;background:#1e293b;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <h2 style="margin:0;font-size:15px;color:#fff;font-weight:bold;">${tf('weightEditorTitle', { name: escHtml(META_PRESET.name || t('weightDefaultPreset')) })}</h2>
      <button onclick="closeWeightEditor()" aria-label="${t('close')}" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;line-height:1;">✕</button>
    </div>

    ${baselineBanner}
    ${explanation}

    <div style="padding:10px 20px;background:#111827;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;">${tabsHtml}</div>
      <button id="we-copy-btn" onclick="weCopyToOutfield()"
        style="margin-left:auto;padding:3px 10px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer;display:${firstGroup==='GK'?'none':''};">
        ${t('weightCopyOutfield')}
      </button>
    </div>

    ${profRow}

    <div style="padding:0 20px;overflow-y:auto;flex-grow:1;">${gridsHtml}</div>

    <div style="padding:12px 20px;background:#1e293b;border-top:1px solid #334155;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">
      <button onclick="weDownloadJson()" style="padding:6px 14px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:6px;font-size:12px;cursor:pointer;">${t('weightDownloadJson')}</button>
      <button onclick="weApply()" style="padding:6px 16px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;">${t('weightApplyClose')}</button>
      <button onclick="closeWeightEditor()" style="padding:6px 14px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:6px;font-size:12px;cursor:pointer;">${t('weightCancel')}</button>
    </div>
  </div>`;

  modal.style.display = 'flex';
}

function closeWeightEditor() {
  const modal = $('weight-editor-modal');
  if (modal) modal.style.display = 'none';
}

function weShowTab(group) {
  _weActiveTab = group;
  document.querySelectorAll('.we-tab-btn').forEach(b => {
    const active = b.dataset.g === group;
    b.style.background   = active ? '#3b82f6' : '#0f172a';
    b.style.color        = active ? '#fff'     : '#64748b';
    b.style.borderColor  = active ? '#3b82f6'  : '#334155';
  });
  document.querySelectorAll('.we-grid').forEach(d => {
    d.style.display = d.dataset.g === group ? 'flex' : 'none';
  });
  const copyBtn = $('we-copy-btn');
  if (copyBtn) copyBtn.style.display = group === 'GK' ? 'none' : '';
}

function weBuildJson() {
  const raw          = META_PRESET.raw || {};
  const baseline     = raw.baseline ?? 8;
  const defaultRange = 20 - baseline;
  const posW = {}, newRanges = {}, newFrom = {};

  // Read from _weSegments (editor source of truth)
  for (const [g, gSegs] of Object.entries(_weSegments)) {
    posW[g] = {};
    for (const [attr, segs] of Object.entries(gSegs)) {
      if (!segs || !segs.length) continue;
      if (segs.length === 1) {
        // Single segment → scalar weight (backward compatible)
        const { from, to, pts } = segs[0];
        if (pts !== 0) posW[g][attr] = pts;
        const range = to - from;
        if (range !== defaultRange) newRanges[attr] = range;
        if (from !== baseline)      newFrom[attr]   = from;
      } else {
        // Multi-segment → array weight (only if at least one non-zero pts)
        if (segs.some(s => s.pts !== 0)) {
          posW[g][attr] = segs.map(({ from, to, pts }) => ({ from, to, pts }));
        }
      }
    }
  }

  // Proficiency: serialize from _weProfSegs
  let proficiencyTest;
  if (_weProfSegs.length === 1) {
    // Single segment → store in old scalar format (backward compat)
    const { from, to, pts } = _weProfSegs[0];
    const range = Math.max(1, to - from);
    proficiencyTest = { points: pts, from, to, range };
  } else {
    // Multiple segments → store as segments array; also keep scalar fields for fallback readers
    const top = _weProfSegs[0];
    const range = Math.max(1, top.to - top.from);
    proficiencyTest = {
      points: top.pts, from: top.from, to: top.to, range,
      segments: _weProfSegs.map(({ from, to, pts }) => ({ from, to, pts })),
    };
  }

  const result = {
    ...raw,
    position_weights: posW,
    proficiency_test: proficiencyTest,
    name: (raw.name || 'Custom') + ' (edited)',
  };
  if (Object.keys(newRanges).length) result.attr_test_ranges = newRanges;
  else delete result.attr_test_ranges;
  if (Object.keys(newFrom).length) result.attr_test_from = newFrom;
  else delete result.attr_test_from;
  return result;
}

function weCopyToOutfield() {
  const src = _weActiveTab;
  if (!src || src === 'GK') return;
  const srcSegs = _weSegments[src] || {};
  ['DC','FB','DM','MC','WM','AM','ST'].filter(g => g !== src).forEach(g => {
    if (!_weSegments[g]) _weSegments[g] = {};
    for (const [attr, segs] of Object.entries(srcSegs)) {
      _weSegments[g][attr] = segs.map(s => ({ ...s }));   // deep copy
      weRenderAttrSegs(g, attr);
    }
  });
  showToast(t('weightsCopied'), 'check');
}

function weApply() {
  loadAndApplyPreset(weBuildJson());
  closeWeightEditor();
}

function weDownloadJson() {
  const data = weBuildJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = (data.name || 'meta-preset').replace(/\s+/g, '_') + '.json';
  a.click(); URL.revokeObjectURL(url);
}

// Async startup: try localStorage → fetch default_direct.json → BUILTIN_PRESET (already applied).
(async () => {
  // 1. Restore last-used preset from localStorage
  try {
    const saved = localStorage.getItem('fmss_meta_preset');
    if (saved) {
      applyMetaPreset(JSON.parse(saved));
      updatePresetLabel();
      populateMetaGroupSelect();
      // Players may already be rendered; re-render to pick up restored preset.
      if (state.players && state.players.length) renderTable();
      return;
    }
  } catch {}
  // 2. Fetch the bundled default_direct.json and apply it (upgrades BUILTIN_PRESET in place)
  try {
    const r = await fetch('/meta-presets/default_direct.json');
    if (r.ok) {
      applyMetaPreset(await r.json());
      updatePresetLabel();
      populateMetaGroupSelect();
      // No re-render needed: default_direct.json is identical to BUILTIN_PRESET.
      return;
    }
  } catch {}
  // 3. Already running on BUILTIN_PRESET — just update the label.
  updatePresetLabel();
  populateMetaGroupSelect();
})();

// nieuwe data ophalen (trigger de plugin)
let fetchTimeout = null;
// Loopt er een "Nieuwe data"-verzoek? Baseline = dumpTime op het moment van de klik, zodat
// poll() een verse dump ook herkent als er nog nooit een dump was (eerste keer na installatie)
// of als de scan zo snel klaar is dat de 'scanning'-status tussen twee polls valt.
let fetchPending = false, fetchBaseDumpTime = null;
$('btn-fetch').onclick = async () => {
  const b = $('banner');
  try {
    const st = await (await fetch('/api/fmstatus')).json();
    if (!st.running) { b.className = 'scanning error'; b.innerHTML = bannerMsg('warning', t('fmNotRunning')); b.onclick = null; return; }
    await fetch('/api/refresh', { method: 'POST' });
    fetchPending = true; fetchBaseDumpTime = lastDumpTime;
    b.className = 'scanning'; b.innerHTML = bannerMsg('hourglass', t('reqSent')); b.onclick = null;
    // Vangnet: pikt de plugin het verzoek niet op (state wordt nooit 'scanning'), dan
    // een duidelijke hint i.p.v. een eeuwige zandloper. poll() annuleert deze time-out
    // zodra de scan echt start.
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(async () => {
      try {
        const s2 = await (await fetch('/api/status')).json();
        if (s2.reader && s2.reader.state === 'scanning') return;   // toch nog gestart
        if (s2.dumpTime && s2.dumpTime !== fetchBaseDumpTime) return;   // dump kwam er wél (snelle scan)
        fetchPending = false;
        b.className = 'scanning error';
        // Structureel niet opgepikt = vrijwel altijd de FM-zelfherstart die de mod-laag
        // eruit gooit (TROUBLESHOOTING.md 4d) → link direct naar de fix.
        b.innerHTML = bannerMsg('warning', t('reqNoPickup'));
        b.onclick = () => { b.className = 'hidden'; };
      } catch { }
    }, 15000);
  } catch (e) {
    // Meestal: de lokale server is weg (achtergrondvenster → server afgesloten). Toon dat
    // duidelijk i.p.v. een raadselachtig "!"; herstart via het venster opnieuw openen.
    console.error('btn-fetch:', e);
    b.className = 'scanning error';
    b.innerHTML = bannerMsg('warning', t('serverGone'));
    b.onclick = () => { b.className = 'hidden'; };
  }
};
$('btn-shortlist-sync').onclick = async () => {
  const status = $('shortlist-sync-status');
  const started = Date.now();
  status.textContent = t('loading');
  try {
    const start = await fetch('/api/shortlist-refresh', { method: 'POST' });
    if (!start.ok) {
      let detail = '';
      try { detail = (await start.json()).error || ''; } catch { }
      throw new Error(detail || t('syncmissing'));
    }
    for (;;) {
      await new Promise(r => setTimeout(r, 700));
      if (Date.now() - started > 90000) throw new Error(t('syncTimeout'));
      const r = await fetch('/api/shortlist-status?t=' + Date.now());
      if (!r.ok) { if (Date.now() - started > 30000) throw new Error(t('syncmissing')); continue; }
      const data = await r.json();
      if (data.state === 'scanning' || new Date(data.at).getTime() < started - 2000) continue;
      if (data.state === 'error') throw new Error(data.error || t('syncmissing'));
      const gameIds = Array.isArray(data.ids) ? data.ids.map(Number).filter(Number.isSafeInteger) : [];
      // Hybrid rows can be absent from an older full dump. The native shortlist
      // probe includes their compact player record so the just-loaded row is
      // immediately visible instead of waiting for another full scan.
      if (Array.isArray(data.players)) {
        const known = new Set(state.allPlayers.map(p => Number(p.id)));
        for (const player of data.players) {
          const id = Number(player?.id);
          if (!Number.isSafeInteger(id) || known.has(id)) continue;
          state.allPlayers.push(player);
          state.players.push(player);
          known.add(id);
        }
      }
      // Keep valid IDs even when FM exposes a ghost/hybrid row that the last
      // full dump did not include yet. The next dump can then rehydrate it,
      // instead of silently shrinking the game shortlist during import.
      state.shortlist = new Set(gameIds);
      localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
      $('sl-count').textContent = state.shortlist.size;
      status.textContent = tf('syncfound', { n: state.shortlist.size });
      showToast(`${state.shortlist.size} ← FM24`, 'check');
      applyFilters();
      break;
    }
  } catch (e) { status.textContent = e.message || t('syncmissing'); showToast(tf('syncError', { error: e.message || e })); }
};

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-html]').forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
  // ?-helpteksten tonen via de eigen app-tooltip (zie initHelpTip), niet meer via title.
  $('f-name').placeholder = t('searchph');
  $('btn-coffee').title = t('donateBtn');
  // Max. loon-label draagt de gekozen salarisperiode (de generieke data-i18n-pass hierboven
  // zette alleen de kale tekst).
  const mw = document.querySelector('[data-i18n="maxwage"]');
  if (mw) mw.textContent = t('maxwage') + ' ' + wageSuf();
  $('set-version').textContent = 'FMSuperScout 24 v' + APP_VERSION;
  $('upd-note').textContent = '';   // checkresultaat is een momentopname in de oude taal
  updateAdvBtn();
  renderDumpInfo();
  renderClubBadge();
  renderVerWarn();
  buildStaffRoles();
  buildGenderFilter();
  buildFootOptions();
  buildRoleSelect();
  buildDivisions();
  renderDevSection();
  renderIntakeBar();
  renderPresets();
  updateBulkBar();
  renderTable();   // kolomkoppen zijn vertaald → header opnieuw opbouwen
  if (state.mode === 'club-list') renderClubList();
  applyFilters();
  if (state.selected) showDetail(state.selected);
}

function setMode(mode) {
  const previousHistPeriod = state.histPeriod;
  persistFilterTab(state.mode);
  state.mode = mode;
  if (FILTER_TAB_MODES.has(mode)) restoreFilterTab(mode);
  if (mode === 'myplayer') $('f-myclub').checked = true;
  const requestedHistPeriod = $('f-hist-period').value;
  const histPeriodChanged = FILTER_TAB_MODES.has(mode) && HIST_PERIODS.includes(requestedHistPeriod)
    && requestedHistPeriod !== previousHistPeriod;
  const histRefresh = histPeriodChanged && mode !== 'staff' && histReady()
    ? setHistPeriod(requestedHistPeriod) : null;
  const isAn = mode === 'analysis';
  const isXi = mode === 'bestxi';
  const isClubList = mode === 'club-list';
  const isMyPlayer = mode === 'myplayer';
  const isCustomView = isAn || isXi || isClubList;

  $('tab-players').classList.toggle('active', mode === 'players');
  $('tab-staff').classList.toggle('active', mode === 'staff');
  $('tab-shortlist').classList.toggle('active', mode === 'shortlist');
  $('tab-myplayer').classList.toggle('active', isMyPlayer);
  $('tab-analysis').classList.toggle('active', isAn);
  if ($('tab-bestxi')) $('tab-bestxi').classList.toggle('active', isXi);
  if ($('tab-club-list')) $('tab-club-list').classList.toggle('active', isClubList);

  const isStaff = mode === 'staff';
  $('fg-pitch').style.display = isStaff || isCustomView ? 'none' : '';
  $('fg-clubfilters').style.display = isClubList ? '' : 'none';
  $('fg-staffrole').style.display = isStaff ? '' : 'none';
  $('fg-role').style.display = isStaff || isCustomView ? 'none' : '';
  $('f-meta-group-row').style.display = isStaff ? 'none' : '';
  $('f-meta-row').style.display = isStaff ? 'none' : '';   // meta-score bestaat niet voor staf
  $('f-metapa-row').style.display = isStaff ? 'none' : '';
  // Staf heeft geen lengte, voet, PA-groei of speler-transferopties; die filters horen daar niet.
  $('fg-physical').style.display = isStaff ? 'none' : '';
  $('f-wonderkid-row').style.display = isStaff ? 'none' : '';
  $('f-price-row').style.display = isStaff ? 'none' : '';
  $('f-fee-row').style.display = isStaff ? 'none' : '';
  $('f-interest-row').style.display = isStaff ? 'none' : '';
  $('f-tstatus-row').style.display = isStaff ? 'none' : '';
  $('f-shortlist-row').style.display = isStaff ? 'none' : '';
  buildGenderFilter();   // spelers- en staflijst kunnen apart gemengd zijn
  renderDevSection();    // historie wordt alleen voor spelers bijgehouden
  renderIntakeBar();

  if (hiddenStatCol(state.sortKey)) { state.sortKey = mode === 'staff' ? 'wage' : 'ca'; state.sortDir = -1; }
  $('sl-bar').classList.toggle('hidden', mode !== 'shortlist');
  renderMyTeamChips();
  document.body.classList.toggle('mode-analysis', isAn || isXi);
  document.body.classList.toggle('mode-club-list', isClubList);
  state.bulkSelected.clear();
  state.bulkAnchor = null;
  updateBulkBar();
  state.selected = null;
  $('detail').classList.add('hidden');
  $('detail-backdrop').classList.add('hidden');

  const toggleView = (id, show) => {
    const el = $(id);
    if (el) { el.style.display = show ? 'block' : 'none'; el.classList.toggle('hidden', !show); }
  };

  toggleView('table-wrap', !isCustomView);
  toggleView('analysis', isAn);
  toggleView('bestxi', isXi);
  toggleView('club-list-view', isClubList);
  if (isClubList) $('club-list-view').style.display = 'flex';
  if (isClubList) { $('chipbar').innerHTML = ''; renderClubList(); return; }
  if (isAn) { $('chipbar').innerHTML = ''; renderAnalysis(); return; }
  if (isXi) { $('chipbar').innerHTML = ''; renderBestXI(); return; }

  $('table-wrap').style.display = '';
  $('analysis').classList.add('hidden');
  if (!activeCols().find(c => c.key === state.sortKey)) { state.sortKey = 'ca'; state.sortDir = -1; }
  renderTable();
  applyFilters();
  if (histRefresh) histRefresh.then(() => {
    if (state.mode !== mode) return;
    renderDevSection();
    renderTable();
    applyFilters();
  });
}

// BINDINGS DES NOUVEAUX ONGLETS
if ($('tab-bestxi')) $('tab-bestxi').onclick = () => setMode('bestxi');
if ($('tab-club-list')) $('tab-club-list').onclick = () => setMode('club-list');
$('fg-clubfilters').addEventListener('input', e => {
  if (e.target.matches('input') && !['club-filter-league', 'club-filter-nation'].includes(e.target.id)) applyClubListFilters();
});
$('club-list-head').addEventListener('click', e => {
  const th = e.target.closest('[data-club-sort]');
  if (!th) return;
  const key = th.dataset.clubSort;
  if (clubListSortKey === key) clubListSortDir *= -1;
  else {
    clubListSortKey = key;
    clubListSortDir = ['name', 'nation', 'league'].includes(key) ? 1 : -1;
  }
  renderClubList();
});
$('club-list-table-wrap').addEventListener('scroll', () => {
  if (clubListScrollQueued) return;
  clubListScrollQueued = true;
  requestAnimationFrame(() => { clubListScrollQueued = false; renderClubListVisible(); });
});
$('tab-players').onclick = () => setMode('players');
$('tab-staff').onclick = () => setMode('staff');
$('tab-shortlist').onclick = () => setMode('shortlist');
$('tab-myplayer').onclick = () => {
  if (!state.meta.myClub) showToast(t('bestxi_autoNoClub'), 'warning');
  setMode('myplayer');
};
$('tab-analysis').onclick = () => setMode('analysis');
// Niet direct koppelen: dan wordt het MouseEvent als force=true doorgegeven en
// omzeilt elke klik de OOM-crashdetectie die loadDump(true) juist als bewuste
// escape-hatch heeft.
$('btn-reload').onclick = () => loadDump();

// ---------- teamchips: 1e/2e/jeugd binnen "Mijn club" ----------
// Zichtbaar zodra het "Mijn club"-vinkje aanstaat én de dump teamType-data heeft
// (plugin v0.1.10+); oudere dumps → chips blijven verborgen, filter doet niets.
function renderMyTeamChips() {
  const box = $('myteam-chips');
  const myClub = (state.meta.myClub || '').toLowerCase();
  const myClubId = Number(state.meta.myClubId) || 0;
  const hasData = myClub && state.players.some(p => p.teamType != null &&
    (myClubId && p.clubId ? Number(p.clubId) === myClubId : (p.club || '').toLowerCase() === myClub));
  const show = hasData && $('f-myclub').checked && state.mode !== 'staff';
  box.style.display = show ? '' : 'none';
  if (!show) return;
  const opts = [['all', t('mt_all')], ['first', t('mt_first')], ['res', t('mt_res')], ['youth', t('mt_youth')]];
  box.innerHTML = opts.map(([k, lbl]) =>
    `<button class="mt-chip ${state.myTeam === k ? 'on' : ''}" data-mt="${k}">${lbl}</button>`).join('');
  box.querySelectorAll('.mt-chip').forEach(b => b.onclick = () => {
    state.myTeam = b.dataset.mt;
    renderMyTeamChips();
    applyFilters();
  });
}
$('f-myclub').addEventListener('change', renderMyTeamChips);

// ---------- statuspolling (Nieuwe data / knop-feedback) ----------
let lastPluginState = null, lastDumpTime = null;
async function poll() {
  try {
    const st = await (await fetch('/api/status')).json();
    const b = $('banner');
    const pl = st.reader;
    if (pl && pl.state === 'scanning') {
      clearTimeout(fetchTimeout);   // plugin heeft het verzoek opgepikt
      // De plugin ververst status.json tijdens een scan minstens elke ~2s. Staat er
      // "scanning" maar is het bestand 15s+ oud, dan is FM24 mid-scan gestopt/gecrasht:
      // zonder deze check bleef de voortgangsbalk eeuwig staan.
      if (typeof pl.mtime === 'number' && Date.now() - pl.mtime > 15000) {
        b.className = 'scanning error';
        b.innerHTML = bannerMsg('warning', t('scanStalled'));
        b.onclick = () => { b.className = 'hidden'; };
      } else {
        b.className = 'scanning';
        // Plugin v0.1.2+ schrijft echte scanvoortgang (0..1) in status.json; oudere
        // plugins niet — dan de oude tekstbanner zonder balk.
        b.innerHTML = typeof pl.progress === 'number'
          ? bannerProgress('hourglass', t('dumping'), pl.progress)
          : bannerMsg('hourglass', t('dumping'));
      }
    }
    else if (pl && pl.state === 'error') {
      clearTimeout(fetchTimeout); fetchPending = false;   // plugin hééft gereageerd; geen "pikt het niet op" eroverheen
      b.className = 'scanning error';
      b.innerHTML = bannerMsg('warning', t('dumpError') + (pl.error ? ': ' + pl.error : ''));
      b.onclick = null;
    }
    else if (pl && pl.state === 'done') {
      // Nieuwe dump herkennen langs drie routes: (1) dumpTime veranderd t.o.v. een eerder
      // bekende dump, (2) we zagen de scan lopen, (3) een klik op "Nieuwe data" en er ligt
      // een andere dump dan bij die klik — dekt snelle scans die tussen twee polls vallen
      // én de allereerste dump op een verse installatie (lastDumpTime was toen nog null).
      const fresh = (st.dumpTime && st.dumpTime !== lastDumpTime && lastDumpTime !== null)
        || lastPluginState === 'scanning'
        || (fetchPending && st.dumpTime && st.dumpTime !== fetchBaseDumpTime);
      if (fresh) {
        clearTimeout(fetchTimeout); fetchPending = false;
        // Nieuwe dump klaar → automatisch laden; de groene balk is alleen nog een
        // korte bevestiging (verdwijnt vanzelf), geen klik meer nodig.
        loadDump().then(ok => {
          if (!ok) return;   // laadfout: loadDump toont zelf het foutscherm en de foutbanner
          b.className = 'done';
          b.innerHTML = bannerMsg('check', `${t('dumpLoaded')} (${(pl.players ?? 0).toLocaleString()} · ${(pl.staff ?? 0).toLocaleString()})`);
          b.onclick = () => { b.className = 'hidden'; };
          setTimeout(() => { if (b.className === 'done') b.className = 'hidden'; }, 6000);
        });
      }
    }
    lastPluginState = pl ? pl.state : null;
    if (st.dumpTime) lastDumpTime = st.dumpTime;
  } catch { /* server weg */ }
  // Tijdens een scan sneller pollen zodat de voortgangsbalk vloeiend meeloopt.
  setTimeout(poll, lastPluginState === 'scanning' ? 750 : 2000);
}

// Heartbeat: alleen in de standalone app-modus, zodat de server stopt als het venster sluit.
// In dev-modus (browser) niet nodig, dat scheelt onnodig netwerkverkeer.
async function initHeartbeat() {
  try {
    const st = await (await fetch('/api/status')).json();
    if (!st.appMode) return;
    const beat = () => fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    setInterval(beat, 4000); beat();
    // Achtergrondvensters knijpen timers af, dus klop ook meteen zodra het venster weer
    // zichtbaar of gefocust wordt — dan is de server gegarandeerd vers bij de eerste klik.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    window.addEventListener('focus', beat);
    window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/bye'); } catch {} });
  } catch { /* server weg */ }
}
initHeartbeat();

buildPitch();
applyLang();
document.body.classList.toggle('hide-capa', state.hideCapa);
document.body.classList.toggle('hide-meta', state.hideMeta);
$('sl-count').textContent = state.shortlist.size;
loadDump().then(() => poll());
