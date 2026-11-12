// Définition des outils de suivi (hors tétées). Chaque outil décrit ses champs ;
// le formulaire, la validation, le journal et les résumés en découlent.
//
// Types de champ : choice (un choix), multi (plusieurs), number, text, textarea, datetime.
// showIf : { key, in: [...] } n'affiche le champ que pour certaines valeurs d'un autre.

const NOTE = Object.freeze({ key: 'note', type: 'textarea', label: 'Note', max: 300 });

export const TOOLS = Object.freeze([
  {
    key: 'couche', name: 'Couches', icon: '💧', atLabel: 'Heure',
    quick: [
      { label: 'Pipi', data: { kind: 'pipi' } },
      { label: 'Selles', data: { kind: 'selles' } },
      { label: 'Les deux', data: { kind: 'mixte' } },
    ],
    fields: [
      { key: 'kind', type: 'choice', label: 'Contenu', required: true,
        options: [['pipi', 'Pipi'], ['selles', 'Selles'], ['mixte', 'Les deux']] },
      { key: 'couleur', type: 'choice', label: 'Couleur des selles', showIf: { key: 'kind', in: ['selles', 'mixte'] },
        options: [['jaune', 'Jaune'], ['verte', 'Verte'], ['brune', 'Brune'], ['noire', 'Noire (méconium)'], ['autre', 'Autre']] },
      { key: 'texture', type: 'choice', label: 'Consistance', showIf: { key: 'kind', in: ['selles', 'mixte'] },
        options: [['liquide', 'Liquide'], ['grumeleuse', 'Grumeleuse'], ['pateuse', 'Pâteuse'], ['dure', 'Dure']] },
      NOTE,
    ],
  },
  {
    key: 'sommeil', name: 'Sommeil', icon: '🌙', atLabel: 'Endormie à', defaultAgoMin: 60,
    fields: [
      { key: 'end', type: 'datetime', label: 'Réveillée à', required: true },
      { key: 'lieu', type: 'choice', label: 'Où',
        options: [['lit', 'Berceau / lit'], ['bras', 'Dans les bras'], ['porte', 'Porte-bébé'], ['poussette', 'Poussette'], ['voiture', 'Voiture']] },
      NOTE,
    ],
  },
  {
    key: 'medic', name: 'Vitamines et médicaments', icon: '💊', atLabel: 'Heure',
    quick: [{ label: 'Vitamine D donnée', data: { produit: 'vitd' } }],
    fields: [
      { key: 'produit', type: 'choice', label: 'Produit', required: true,
        options: [['vitd', 'Vitamine D'], ['vitk', 'Vitamine K'], ['para', 'Paracétamol'], ['autre', 'Autre']] },
      { key: 'nom', type: 'text', label: 'Nom du produit', max: 60, showIf: { key: 'produit', in: ['autre'] }, required: true },
      { key: 'dose', type: 'text', label: 'Dose', max: 40, placeholder: 'ex. 1 goutte' },
      NOTE,
    ],
  },
  {
    key: 'biberon', name: 'Tire-lait et biberons', icon: '🍼', atLabel: 'Heure',
    fields: [
      { key: 'kind', type: 'choice', label: 'Type', required: true,
        options: [['tire', 'Tire-lait'], ['bib_lm', 'Biberon lait maternel'], ['bib_li', 'Biberon lait infantile']] },
      { key: 'ml', type: 'number', label: 'Quantité', unit: 'ml', min: 1, max: 400, step: 5, required: true },
      { key: 'cote', type: 'choice', label: 'Sein', showIf: { key: 'kind', in: ['tire'] },
        options: [['G', 'Gauche'], ['D', 'Droit'], ['GD', 'Les deux']] },
      { key: 'duree', type: 'number', label: 'Durée', unit: 'min', min: 1, max: 120, step: 1, showIf: { key: 'kind', in: ['tire'] } },
      NOTE,
    ],
  },
  {
    key: 'sante', name: 'Température et santé', icon: '🌡️', atLabel: 'Heure', needsOneOf: ['temp', 'symptomes', 'note'],
    fields: [
      { key: 'temp', type: 'number', label: 'Température', unit: '°C', min: 34, max: 43, step: 0.1, decimals: 1 },
      { key: 'symptomes', type: 'multi', label: 'Observé',
        options: [['regurg', 'Régurgitations'], ['vomi', 'Vomissements'], ['coliques', 'Coliques'], ['rhume', 'Nez bouché'],
          ['toux', 'Toux'], ['fesses', 'Érythème fessier'], ['jaune', 'Teint jaune'], ['autre', 'Autre']] },
      NOTE,
    ],
  },
  {
    key: 'croissance', name: 'Poids et taille', icon: '📏', atLabel: 'Date de la mesure', needsOneOf: ['poids', 'taille', 'crane'],
    fields: [
      { key: 'poids', type: 'number', label: 'Poids', unit: 'g', min: 1000, max: 20000, step: 10 },
      { key: 'taille', type: 'number', label: 'Taille', unit: 'cm', min: 30, max: 110, step: 0.5, decimals: 1 },
      { key: 'crane', type: 'number', label: 'Périmètre crânien', unit: 'cm', min: 25, max: 60, step: 0.5, decimals: 1 },
      { key: 'lieu', type: 'choice', label: 'Mesuré',
        options: [['maison', 'À la maison'], ['pediatre', 'Chez le pédiatre'], ['pmi', 'À la PMI'], ['maternite', 'À la maternité'], ['sagefemme', 'Par la sage-femme']] },
      NOTE,
    ],
  },
  {
    key: 'bain', name: 'Bains', icon: '🛁', atLabel: 'Heure',
    quick: [{ label: 'Bain donné', data: {} }],
    fields: [NOTE],
  },
  {
    key: 'rdv', name: 'Rendez-vous et vaccins', icon: '📅', atLabel: 'Date et heure', allowFuture: true,
    fields: [
      { key: 'kind', type: 'choice', label: 'Type', required: true,
        options: [['pediatre', 'Pédiatre'], ['pmi', 'PMI'], ['sagefemme', 'Sage-femme'], ['vaccin', 'Vaccin'], ['examen', 'Examen'], ['autre', 'Autre']] },
      { key: 'titre', type: 'text', label: 'Précision', max: 80, placeholder: 'ex. nom du vaccin, du médecin' },
      { key: 'lieu', type: 'text', label: 'Lieu', max: 80 },
      NOTE,
    ],
  },
  {
    key: 'souvenir', name: 'Premières fois et souvenirs', icon: '⭐', atLabel: 'Date',
    fields: [
      { key: 'titre', type: 'text', label: 'Quoi', max: 80, required: true, placeholder: 'ex. premier sourire' },
      { ...NOTE, max: 1000, label: 'Récit' },
    ],
  },
]);

export const TOOL_BY_KEY = Object.freeze(Object.fromEntries(TOOLS.map((t) => [t.key, t])));

export const optionLabel = (field, value) => field.options?.find(([v]) => v === value)?.[1] ?? value;

/** Le champ est-il visible compte tenu des autres valeurs ? */
export const isShown = (field, data) => !field.showIf || field.showIf.in.includes(data[field.showIf.key]);
