// Curated familier / argot / verlan / vulgar lemmas that Lexique (books + film subtitles)
// misses or ranks too low. [lemma, pos, gender]; added with SLANG_FREQ when absent.

export const SLANG_FREQ = 3;

export const SLANG_LEMMAS = [
  // money
  ["thune", "noun", "f"], ["tune", "noun", "f"], ["fric", "noun", "m"], ["oseille", "noun", "f"], ["blé", "noun", "m"],
  ["flouze", "noun", "m"], ["pognon", "noun", "m"], ["pèze", "noun", "m"], ["maille", "noun", "f"], ["biff", "noun", "m"],
  ["ronds", "noun", "m"], ["balles", "noun", "f"], ["raquer", "verb", "none"], ["fauché", "adj", "none"], ["raide", "adj", "none"],
  ["taf", "noun", "m"], ["taffer", "verb", "none"], ["boulot", "noun", "m"], ["bosser", "verb", "none"], ["charbonner", "verb", "none"],
  ["arnaquer", "verb", "none"], ["gratter", "verb", "none"], ["dealer", "verb", "none"], ["bicrave", "verb", "none"],
  // people
  ["meuf", "noun", "f"], ["keum", "noun", "m"], ["mec", "noun", "m"], ["nana", "noun", "f"], ["gonzesse", "noun", "f"],
  ["daron", "noun", "m"], ["daronne", "noun", "f"], ["reuf", "noun", "m"], ["reum", "noun", "f"], ["frérot", "noun", "m"],
  ["frangin", "noun", "m"], ["frangine", "noun", "f"], ["pote", "noun", "mf"], ["poto", "noun", "m"], ["srab", "noun", "m"],
  ["gadjo", "noun", "m"], ["gadji", "noun", "f"], ["keupon", "noun", "m"], ["rebeu", "noun", "m"], ["renoi", "noun", "m"],
  ["céfran", "noun", "m"], ["babtou", "noun", "m"], ["bolosse", "noun", "mf"], ["boloss", "noun", "mf"], ["blaireau", "noun", "m"],
  ["beauf", "noun", "m"], ["bouffon", "noun", "m"], ["relou", "adj", "none"], ["tocard", "noun", "m"], ["mytho", "noun", "mf"],
  ["mythonner", "verb", "none"], ["crush", "noun", "m"], ["go", "noun", "f"], ["bébé", "noun", "m"], ["môme", "noun", "mf"],
  ["gamin", "noun", "m"], ["morveux", "noun", "m"], ["vieux", "noun", "m"], ["toubib", "noun", "m"], ["prof", "noun", "mf"],
  // police & trouble
  ["keuf", "noun", "m"], ["flic", "noun", "m"], ["poulet", "noun", "m"], ["schmitt", "noun", "m"], ["bleu", "noun", "m"],
  ["condé", "noun", "m"], ["taule", "noun", "f"], ["zonzon", "noun", "f"], ["placard", "noun", "m"], ["embrouille", "noun", "f"],
  ["baston", "noun", "f"], ["bastonner", "verb", "none"], ["choper", "verb", "none"], ["pécho", "verb", "none"], ["serrer", "verb", "none"],
  ["balancer", "verb", "none"], ["balance", "noun", "f"], ["cramer", "verb", "none"], ["galère", "noun", "f"], ["galérer", "verb", "none"],
  ["zonard", "noun", "m"], ["racaille", "noun", "f"], ["caillera", "noun", "f"], ["tess", "noun", "f"], ["téci", "noun", "f"],
  // food & drink
  ["bouffe", "noun", "f"], ["bouffer", "verb", "none"], ["graille", "noun", "f"], ["grailler", "verb", "none"], ["dalle", "noun", "f"],
  ["picole", "noun", "f"], ["picoler", "verb", "none"], ["pinard", "noun", "m"], ["binouze", "noun", "f"], ["mousse", "noun", "f"],
  ["kawa", "noun", "m"], ["clope", "noun", "f"], ["tise", "noun", "f"], ["tiser", "verb", "none"], ["bourré", "adj", "none"],
  ["chelou", "adj", "none"], ["kebab", "noun", "m"], ["grec", "noun", "m"], ["tacos", "noun", "m"],
  // partying
  ["teuf", "noun", "f"], ["soirée", "noun", "f"], ["chiller", "verb", "none"], ["kiffer", "verb", "none"], ["kif", "noun", "m"],
  ["ambiance", "noun", "f"], ["boîte", "noun", "f"], ["bédo", "noun", "m"], ["beuh", "noun", "f"], ["shit", "noun", "m"],
  ["pétard", "noun", "m"], ["joint", "noun", "m"], ["défoncé", "adj", "none"], ["perché", "adj", "none"], ["déchiré", "adj", "none"],
  // transport
  ["caisse", "noun", "f"], ["bagnole", "noun", "f"], ["tire", "noun", "f"], ["gova", "noun", "f"], ["tromé", "noun", "m"],
  ["bécane", "noun", "f"], ["meule", "noun", "f"], ["scoot", "noun", "m"], ["bus", "noun", "m"], ["rer", "noun", "m"],
  // emotions & reactions
  ["vénère", "adj", "none"], ["vnr", "adj", "none"], ["seum", "noun", "m"], ["ouf", "adj", "none"], ["zarbi", "adj", "none"],
  ["chanmé", "adj", "none"], ["stylé", "adj", "none"], ["grave", "adv", "none"], ["trop", "adv", "none"], ["vachement", "adv", "none"],
  ["kiffant", "adj", "none"], ["flipper", "verb", "none"], ["flippant", "adj", "none"], ["flemme", "noun", "f"], ["flemmard", "adj", "none"],
  ["saouler", "verb", "none"], ["soûler", "verb", "none"], ["gonfler", "verb", "none"], ["vexer", "verb", "none"], ["dégoûté", "adj", "none"],
  ["crevé", "adj", "none"], ["naze", "adj", "none"], ["nul", "adj", "none"], ["sympa", "adj", "none"], ["cool", "adj", "none"],
  ["dingue", "adj", "none"], ["mortel", "adj", "none"], ["frais", "adj", "none"], ["chaud", "adj", "none"], ["oklm", "adv", "none"],
  ["tranquille", "adj", "none"], ["malaise", "noun", "m"], ["gênant", "adj", "none"], ["bader", "verb", "none"], ["ghoster", "verb", "none"],
  // everyday speech
  ["wesh", "expression", "none"], ["ouais", "expression", "none"], ["bah", "expression", "none"], ["bof", "expression", "none"],
  ["genre", "expression", "none"], ["du coup", "expression", "none"], ["en mode", "expression", "none"], ["vas-y", "expression", "none"],
  ["laisse tomber", "expression", "none"], ["laisse béton", "expression", "none"], ["c'est mort", "expression", "none"],
  ["c'est ouf", "expression", "none"], ["c'est chaud", "expression", "none"], ["tkt", "expression", "none"], ["jsp", "expression", "none"],
  ["mdr", "expression", "none"], ["ptdr", "expression", "none"], ["askip", "expression", "none"], ["frère", "noun", "m"],
  ["truc", "noun", "m"], ["machin", "noun", "m"], ["bordel", "noun", "m"], ["bled", "noun", "m"], ["piaule", "noun", "f"],
  ["fringues", "noun", "f"], ["sapes", "noun", "f"], ["pompes", "noun", "f"], ["portable", "noun", "m"], ["tel", "noun", "m"],
  ["bahut", "noun", "m"], ["exam", "noun", "m"], ["sécher", "verb", "none"], ["capter", "verb", "none"], ["piger", "verb", "none"],
  ["mater", "verb", "none"], ["zyeuter", "verb", "none"], ["causer", "verb", "none"], ["jacter", "verb", "none"],
  ["tirer", "verb", "none"], ["casser", "verb", "none"], ["arracher", "verb", "none"], ["bouger", "verb", "none"], ["kiffer", "verb", "none"],
  ["foutre", "verb", "none"], ["piquer", "verb", "none"], ["taper", "verb", "none"], ["squatter", "verb", "none"], ["poireauter", "verb", "none"],
  ["ramer", "verb", "none"], ["clamser", "verb", "none"], ["crever", "verb", "none"], ["pioncer", "verb", "none"], ["roupiller", "verb", "none"],
  ["bouquin", "noun", "m"], ["gosse", "noun", "mf"], ["boss", "noun", "m"], ["clebs", "noun", "m"], ["cabot", "noun", "m"],
  // body
  ["gueule", "noun", "f"], ["tronche", "noun", "f"], ["pif", "noun", "m"], ["tif", "noun", "m"], ["guibole", "noun", "f"],
  ["paluche", "noun", "f"], ["bide", "noun", "m"], ["cul", "noun", "m"], ["fesses", "noun", "f"], ["nichons", "noun", "m"],
  // vulgar
  ["putain", "expression", "none"], ["merde", "noun", "f"], ["chier", "verb", "none"], ["emmerder", "verb", "none"], ["con", "noun", "m"],
  ["connard", "noun", "m"], ["connasse", "noun", "f"], ["conneries", "noun", "f"], ["salaud", "noun", "m"], ["salope", "noun", "f"],
  ["enculé", "noun", "m"], ["enculer", "verb", "none"], ["niquer", "verb", "none"], ["nique", "noun", "f"], ["baiser", "verb", "none"],
  ["bite", "noun", "f"], ["couilles", "noun", "f"], ["chatte", "noun", "f"], ["pute", "noun", "f"], ["fils de pute", "expression", "none"],
  ["ta gueule", "expression", "none"], ["ferme ta gueule", "expression", "none"], ["fait chier", "expression", "none"],
  ["bâtard", "noun", "m"], ["pétasse", "noun", "f"], ["branleur", "noun", "m"], ["branler", "verb", "none"], ["foutage de gueule", "expression", "none"],
];
