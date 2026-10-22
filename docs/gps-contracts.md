# Contrats et non-regression du module GPS

Ce document fige le comportement actuel a preserver avant toute refonte du module GPS. Il distingue les faits verifies dans le code des controles a executer en environnement de test. Aucun test de ce document ne doit supprimer ou modifier les donnees Supabase hors des actions Admin explicitement indiquees.

## Architecture actuelle

- `src/App.jsx` expose deux routes distinctes : `/gps` pour l'administration et `/gps-visualisation` pour la consultation. Le selecteur global fournit saison, journee et identifiant de match aux deux routes.
- Les deux pages React integrent `public/gps/index.html` dans une iframe. Le moteur partage (scripts classiques dans `public/gps/`) dessine le terrain, construit les menus et importe les CSV dans `gps-worker.js`.
- React lit et telecharge les fichiers Supabase, puis transmet des objets `File` a l'iframe avec `postMessage`. Le pont verifie l'origine et la fenetre source.
- Chaque demande de chargement porte un identifiant unique ; l'iframe renvoie un accuse de reception ou une erreur associee a cette demande. Les reglages sont envoyes separement afin qu'un changement de parametre ne relance pas l'import des CSV.
- L'iframe signale aussi les erreurs asynchrones du Worker au pont. Les erreurs par fichier sont renvoyees aux pages React au lieu d'etre presentees comme un chargement complet.
- `src/lib/gps-frame.js` centralise le telechargement des CSV et l'ordre des messages Admin/Viewer. Le script d'import non utilise a ete retire ; `public/gps/import-ui.js` reste l'unique adaptateur d'import pour les controles manuels et React.
- `public/gps/video-sync.js` ouvre `public/gps/video.html` dans une fenetre separee. Les messages entre les deux fenetres relient leurs timelines apres alignement explicite.
- `public/gps/fullscreen.js` est l'unique gestionnaire du plein ecran pour Admin et Viewer ; `viewer-controls.js` ne cree plus un second bouton ni un second cycle d'evenements plein ecran.
- En Admin, le plein ecran natif masque les panneaux de configuration pour privilegier le terrain, avec un bouton de sortie dans la barre de lecture. En Viewer, le plein ecran conserve terrain, equipes et commandes.
- Le Viewer deplace le conteneur du terrain dans une grille CSS geree par `viewer-layout.css` ; les listes domicile/exterieur restent des panneaux dedies. La grille passe de trois colonnes sur grand ecran a deux colonnes sous 900 px puis une colonne sous 520 px. La page Admin conserve sa structure et ses styles.
- L'Admin presente les erreurs par fichier du Worker comme un resume compact avec la liste des fichiers repliable ; les erreurs critiques de chargement ou de sauvegarde restent des alertes visibles.

## Contrat Supabase

### Tables et stockage

La ligne de `match` est identifiee par `uuid_match`. Le module utilise les colonnes suivantes :

- `gps_fichiers` : manifeste JSON avec les listes `domicile` et `exterieur`. Chaque entree peut contenir `id`, `nom`, `path`, `bucket`, `taille` et `importe_le`.
- `gps_parametres` : objet de reglages du moteur. Les sous-objets actuellement utilises comprennent `affichage`, `terrain` et `synchronisation`.
- `gps_video` : reference vers une video Storage `{ type: 'storage', bucket, path, nom }`. Les URL signees sont temporaires et ne sont pas persistees.

Le bucket est le nom de saison normalise : remplacer les tirets par des underscores et ajouter le prefixe `saison_` s'il est absent. Les fichiers CSV historiques utilisent le chemin :

`J{journee}/gps/{uuid_match}/{domicile|exterieur}/{uuid}_{nom_de_fichier_securise}.csv`

La journee est prefixee par `J` si necessaire. Les noms securises sont normalises sans accents puis les caracteres hors `[a-zA-Z0-9._-]` sont remplaces par `_`.

Les videos MP4/WebM d'un match utilisent le meme bucket de saison et le chemin `J{journee}/video/{uuid_match}/{nom_de_fichier}`. Admin liste ce dossier, permet de choisir une video existante et propose l'upload uniquement si aucune video n'est presente. La reference de stockage est enregistree dans `match.gps_video`; une URL signee d'une heure est generee pour la lecture.

### Administration : comportement a preserver

1. Au changement de contexte, Admin lit `gps_fichiers`, `gps_parametres` et `gps_video` sur la ligne du match.
2. Admin liste les CSV presents dans les deux dossiers Storage, fusionne ces objets avec le manifeste par `path`, puis peut mettre a jour `match.gps_fichiers` pour y enregistrer les fichiers retrouves. L'import CSV Admin permet de mapper joueuse, temps, latitude et longitude vers le format du moteur avant le televersement ; vitesse et frequence cardiaque sont facultatives.
3. Viewer effectue la meme decouverte et fusion en memoire ; seul Admin persiste la reconciliation.
4. Les fichiers CSV restent dans Storage ; le chargement Admin et Viewer les decouvre dans les dossiers par equipe, sans modification des objets existants.
5. `gps_fichiers` reste un manifeste de references et Admin peut le reconcilier avec les objets retrouves.
6. Apres telechargement des CSV, Admin envoie `GPS_SETTINGS_APPLY` et `GPS_LOAD_MATCH` a l'iframe. Les reglages sont restaures avant le traitement des fichiers.
7. `GPS_SETTINGS_CHANGED` persiste les reglages avec un delai de regroupement de 700 ms. La selection video Admin persiste une reference Storage, jamais une URL signee.
8. Les CSV restent dans Storage ; les mesures chargees et le bouton « Effacer les donnees » concernent l'etat du moteur dans le navigateur, pas la suppression des objets Supabase.
9. L'interface Admin masque completement la liste des joueuses et ses controles ; le Viewer conserve ces fonctions.

### Viewer : contrat de consultation seule

1. Le Viewer lit les trois colonnes de match et liste les CSV dans Storage par pages de 1000 objets, puis fusionne manifeste et liste en memoire.
2. Il telecharge les CSV et envoie les reglages et fichiers a l'iframe.
3. Le parent Viewer ne doit appeler aucune operation Supabase `insert`, `update`, `upsert` ou `delete`. Il ne persiste ni changements de reglages ni changement de video recus de l'iframe.
4. Les couleurs, visibilites et synchronisation modifiees dans le Viewer ne sont pas des sauvegardes du match. Toute persistance future de ces choix necessite une decision produit et une autorisation explicites.
5. L'etat du moteur reste partage avec le moteur Admin, mais le mode `viewer=1` masque les outils d'import et de configuration. Ces masquages d'interface ne constituent pas un controle d'autorisation Supabase.
6. Les erreurs de chargement dans le Viewer ne sont pas affichees dans l'interface ; elles restent journalisees dans la console.

## Contrat commandes et video

- Les controles GPS existants pilotent lecture/pause, retour au debut, curseur temporel et vitesse.
- Le Viewer ajoute des sauts GPS de -10 s, +10 s et +60 s ; la fenetre video propose aussi des sauts video de -10 s et +10 s.
- Les sauts et recherches video sont bornes a la duree disponible ; en mode synchronise, les controles GPS sont bornes a la plage temporelle commune.
- La fenetre video est ouverte par action utilisateur et peut etre placee manuellement sur un second ecran ; le navigateur ou l'OS gere son placement.
- Sans synchronisation, les timelines GPS et video sont independantes. Avec synchronisation, l'utilisateur aligne les instants puis active la liaison ; les controles GPS transmis au lecteur comprennent lecture/pause, recherche temporelle et vitesse, limites a la plage commune.
- Fermer la fenetre video ou atteindre une limite de la plage commune doit laisser le terrain GPS utilisable.
- La page Admin ne propose pas de video locale ni d'URL libre : elle lit les videos du dossier Storage du match et permet d'en importer une si le dossier est vide.
- Le Viewer genere une URL signee temporaire a partir de la reference Storage en lecture seule ; il conserve la compatibilite avec les anciennes valeurs `gps_video.url`.

## Checklist de non-regression

Executer dans un environnement de test disposant d'un match et de CSV de test. Pour les controles de donnees, noter les valeurs avant/apres et ne pas utiliser un match de production.

### Administration

- [ ] Selectionner saison, journee et match ; verifier que les CSV domicile et exterieur attendus sont charges.
- [ ] Verifier que les CSV deja presents dans les dossiers des deux equipes sont decouverts et charges dans le terrain.
- [ ] Importer un CSV avec des noms de colonnes differents ; mapper joueuse, temps, latitude et longitude, puis verifier les joueuses et positions chargees.
- [ ] Recharger la page ; verifier que les fichiers et le terrain se rechargent.
- [ ] Verifier que le panneau Terrain et vue camera est ouvert par defaut, modifier terrain, affichage, visibilite d'une joueuse et vitesse ; attendre la sauvegarde puis recharger et verifier les reglages conserves.
- [ ] Selectionner une video existante dans `J{journee}/video/{uuid_match}` ; recharger et verifier qu'elle est restauree dans l'outil.
- [ ] Avec un match de test sans video, importer un MP4/WebM et verifier le chemin Storage, la reference `gps_video` et la lecture dans l'outil.
- [ ] Verifier que « Effacer les donnees » n'efface ni l'objet Storage ni l'entree du manifeste.

### Viewer et donnees en lecture seule

- [ ] Ouvrir le meme match dans le Viewer ; verifier que ses CSV donnent les memes joueuses, equipes et positions que l'Administration.
- [ ] Confirmer que les menus Domicile et Exterieur contiennent les bonnes joueuses et que leurs controles de visibilite/coloration agissent sur le terrain.
- [ ] Avant l'essai, relever `gps_fichiers`, `gps_parametres` et `gps_video`. Changer couleur, visibilite, terrain si accessible, synchronisation et URL/video dans le Viewer ; apres l'essai, confirmer que les trois colonnes sont inchangees.
- [ ] Verifier que le Viewer ne propose pas d'import ni d'action de suppression des donnees Supabase.

### Lecture, plein ecran et video

- [ ] Tester lecture, pause, retour au debut, curseur et vitesse GPS sans video.
- [ ] Ouvrir la video, la placer sur un second ecran et tester lecture/pause, retour a 0, sauts -10 s/+10 s, timeline et bornes de duree dans sa fenetre.
- [ ] Aligner et synchroniser ; verifier que lecture/pause, curseur, vitesse et les sauts GPS de -10 s, +10 s et +60 s pilotent la video.
- [ ] Desynchroniser, fermer la fenetre video et atteindre une limite de plage ; verifier que le terrain et ses commandes restent utilisables.
- [ ] Entrer/sortir du plein ecran avec le bouton et Echap, dans Admin et Viewer.
- [ ] Dans Admin, verifier que le bouton « Quitter la vue terrain » fonctionne aussi en mode plein ecran natif et que la case de focus revient a l'etat coherent.
- [ ] Refaire au moins un parcours sur une fenetre etroite ; verifier que terrain, listes d'equipes et commandes restent accessibles.

## Limites de validation

`npm test` execute les tests unitaires sans acces a Supabase : normalisation des noms, fusion du manifeste avec Storage, pagination, propagation des erreurs de liste et ajout de references. Cette checklist reste necessaire pour valider l'integration reelle avec Supabase et les interactions multi-fenetres ; les essais doivent etre effectues sur des donnees de test. La compilation et le lint seuls ne valident ni les politiques d'acces Supabase ni l'atomicite d'ecritures concurrentes.
