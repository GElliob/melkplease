// Canal de diffusion. La version de test a son propre stockage : rien de ce qui
// s'y passe ne touche les données de l'app principale.
export const STORAGE_PREFIX = 'melkplease';
export const CHANNEL_LABEL = '';

// Serveur des commandes Siri et des notifications (adresse publique, pas un secret).
export const SERVER_URL = 'https://melkplease-serveur.melkplease-serveur.workers.dev';
// Espace du serveur : la bêta a le sien, séparé de celui de l'app principale.
export const SERVER_CANAL = '';
