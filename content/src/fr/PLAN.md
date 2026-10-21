# French curriculum plan (DELF Prim)

Source of every word: the derived DELF Prim word list (`content/src/fr/WORDLIST.md`; `npm run content:wordlist -- fr`
builds `content/reference/extracted/wordlist-fr.json` from the nine sample papers plus topic and parity additions).
Units follow the themes the papers test at each level (se présenter, famille, nombres, couleurs, corps, vêtements,
nourriture, animaux, maison, école, loisirs, dates et heures, météo, ville et transports, métiers, fête, santé, voyage,
sentiments, achats, médias …), with the English YLE plan (`content/src/en/PLAN.md`) as a concept checklist so the
French course covers roughly the same everyday world as the English one at the matching level (Starters ↔ A1.1, Movers ↔ A1,
Flyers ↔ A2).

Rules this plan keeps:

- Every lemma of the word list is taught in **exactly one unit**, of its level or a higher one (a few A1.1 lemmas are
  taught in A1 units: *matière, place, septembre*), or listed with a reason in a level's `pack.yaml` `omit`
  (`npm run content:trace -- fr --coverage`). Grammatical words (articles, *de, à, ne, que, se* …) are omitted as
  vocabulary and practised in sentences; nouns are taught with their article.
- **Nouns carry their article** in `target` (*le chat, la maison, l'école*, *les yeux* for plural-only use) and record
  `gender` (m | f, also when the article is elided or plural). Dutch meanings use the matching Dutch article (*de kat,
  het huis*). Options for a noun share its French article; bare-noun word banks share its gender and number.
- **Register:** *tu* throughout (a child talking to a child or family); *vous* only to an adult in a shop, a teacher or
  a stranger, as the papers use it, and then *u* in Dutch (*s'il vous plaît* — *alstublieft*).
- Units of 11–26 words, split by the generator into lessons of 5–8 new words plus a review lesson (*Herhaling*).
- `fr-a1-1-u01` (*Ik en mijn familie*) keeps its unit id, lesson ids l01–l03, sentence ids s01–s11 and the vocabulary
  ids of the original A1.1 pack (`fr.bonjour, fr.salut, fr.je-m-appelle, fr.j-ai, fr.ami, fr.famille …`): progress is
  stored by id.

## Structures per level

| Level | Structures (sentences use only these, `content:trace -- fr` checks the forms) |
|---|---|
| A1.1 | *être, avoir, s'appeler* in the present; the present of everyday verbs as the A1.1 papers use them, including *aller, faire, venir, vouloir, pouvoir, devoir, prendre* (*j'aime, tu fais, tu veux venir, nous allons, elle doit prendre*); whole hours (*à huit heures*); imperative (*Regarde, Finis ton assiette*); *ne … pas*; questions by intonation, with *qu'est-ce que*, *est-ce que* and question words; *il y a*, *il faut*, *c'est / ce sont*; articles, contractions *au, du, des*; possessives *mon/ton/son*; numbers 0–20; colours and adjective agreement |
| A1 | all of A1.1, plus more regular *-er* verbs and irregulars in the present (*savoir, partir, sortir, attendre, perdre*), reflexive verbs as the A1 papers use them (*se lever, se coucher, s'habiller, se promener, se baigner*), prepositions of place (*devant, à côté de, en face de*), all possessives (*notre, votre, leur*), numbers to 100, the time (*à huit heures et demie*), weather with *il fait*, months and dates |
| A2 | all of A1, plus *passé composé* with *avoir* and *être* (agreement of the participle with *être*), *futur proche* (*je vais partir*), comparatives (*plus … que, moins … que, aussi … que, meilleur, mieux*), the other reflexive verbs of the daily routine (*se réveiller, se laver, se brosser les dents*), *il faut* + infinitive, weather and dates in full; imparfait, futur simple and conditionnel only in the forms the A2 papers use (*j'aimerais, je serai, il était*) |

## Deliberate omissions

| What | Why |
|---|---|
| Articles, *de, à, en, par, ne, pas, que, se, me, te, y, ce* as vocabulary | Grammatical words: nouns carry their article; *ne … pas*, *qu'est-ce que*, *il y a*, *je m'appelle* are taught as units; all are practised in sentences |
| Exam-task words attested in the papers (*fiche, compléter, texte, exemple, plusieurs*) | How the exam talks to the candidate, not child vocabulary at that level |
| *faim, soif, falloir, plaire, s'appeler* | Taught inside *avoir faim, avoir soif, il faut, s'il te plaît, je m'appelle* |
| Other omissions | Listed with their reason in each level's `pack.yaml` (`omit`) |

## A1.1 (`fr-a1-1`, 19 units, 349 words)

| Unit | Title | Words |
|---|---|---|
| u01 | Ik en mijn familie | bonjour, salut, je m'appelle, j'ai, l'ami, l'amie, le prénom, la famille, les parents, maman, papa, le frère, la sœur, le grand-père, la grand-mère, les grands-parents, la mère, le père, le garçon, la fille, le copain, la copine, le nom, le voisin, la personne, néerlandais, les Pays-Bas |
| u02 | Hoe gaat het? | au revoir, à bientôt, à demain, bonsoir, bonne nuit, ça va, bien, très, merci, s'il te plaît, s'il vous plaît, oui, non, pardon, excuse-moi, d'accord, voilà, madame, monsieur, ne … pas |
| u03 | Tellen tot twintig | zéro, un, deux, trois, quatre, cinq, six, sept, huit, neuf, dix, onze, douze, treize, quatorze, quinze, seize, dix-sept, dix-huit, dix-neuf, vingt, le nombre, le numéro, compter, l'âge, l'an |
| u04 | Kleuren | la couleur, rouge, bleu, jaune, vert, noir, blanc, rose, orange, violet, gris, marron, préféré, joli, beau, content, triste |
| u05 | Mijn lichaam | la tête, les cheveux, les yeux, le nez, la bouche, l'oreille, la main, le bras, la jambe, le pied, blond, grand, petit, jeune, vieux |
| u06 | Kleren | la robe, le pull, le pantalon, la jupe, le t-shirt, la chaussure, le chapeau, le short, la veste, le manteau, les lunettes, porter, nouveau |
| u07 | Eten en drinken | la pomme, la banane, la fraise, la framboise, le fruit, le gâteau, le chocolat, le pain, le lait, l'eau, le jus, le fromage, l'œuf, la glace, le bonbon, l'assiette, manger, boire, avoir faim, avoir soif, bon |
| u08 | Dieren | l'animal, le chat, le chien, le poisson, l'oiseau, le cheval, le lapin, la souris, l'éléphant, la girafe, le lion, le singe, le tigre |
| u09 | Thuis | la maison, la chambre, la cuisine, le jardin, la porte, la fenêtre, la table, la chaise, le lit, la boîte, l'entrée, le savon, habiter, l'adresse, la rue, ici |
| u10 | Op school | l'école, la classe, le professeur, la maîtresse, l'élève, le cours, la bibliothèque, le livre, le cahier, le crayon, le stylo, la gomme, la règle, les ciseaux, la feuille, la trousse, le sac, le tableau, l'objet, les affaires |
| u11 | Lezen en schrijven | lire, écrire, dessiner, colorier, écouter, regarder, parler, répondre, comprendre, réfléchir, montrer, ouvrir, fermer, poser, la question, la réponse, le mot, la lettre, le message, l'image, le dessin, la langue, le français |
| u12 | Spelen en sporten | jouer, le jeu, le jouet, le ballon, la poupée, le robot, le vélo, faire du vélo, le sport, le football, le tennis, la piscine, nager, courir, danser, chanter, la chanson, la musique, le club, l'activité, les loisirs |
| u13 | Uitjes en feestjes | le parc, la plage, la mer, la montagne, le soleil, l'arbre, la fleur, le village, le bus, le bateau, la voiture, le cinéma, le film, le dessin animé, la télévision, le concert, les vacances, la fête, l'anniversaire, l'invitation, inviter, la carte |
| u14 | Dagen en tijd | lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, le jour, la semaine, le week-end, le matin, l'après-midi, le soir, la nuit, l'heure, la date, aujourd'hui, demain, tôt, avant, après, pendant |
| u15 | Doe mee! | être, avoir, aller, faire, venir, vouloir, pouvoir, devoir, prendre, mettre, donner, dire, voir, aider |
| u16 | Wat doe je graag? | aimer, adorer, préférer, beaucoup, apporter, arriver, commencer, finir, dormir, marcher, laver, rester, laisser, préparer, choisir, connaître, entendre, prêt |
| u17 | Ik en jij | je, tu, il, elle, nous, on, moi, toi, lui, ça, mon, ton, son, autre, chaque |
| u18 | Waar is het? | dans, sur, sous, devant, derrière, à côté de, chez, avec, pour, loin, il y a |
| u19 | Vragen en kleine woorden | comment, où, pourquoi, quand, combien, qu'est-ce que, est-ce que, qui, quoi, quel, et, ou, aussi, il faut, bientôt |

## A1 (`fr-a1`, 23 units, 352 words)

| Unit | Title | Words |
|---|---|---|
| u01 | Tellen tot honderd | vingt et un, trente, quarante, cinquante, soixante, soixante-dix, quatre-vingts, quatre-vingt-dix, cent, mille, premier, deuxième, troisième |
| u02 | Maanden en seizoenen | janvier, février, mars, avril, mai, juin, juillet, août, septembre, octobre, novembre, décembre, le mois, l'année, la saison, le printemps, l'été, l'automne, l'hiver |
| u03 | Hoe laat is het? | la minute, la seconde, le quart, demi, midi, minuit, le rendez-vous, la journée, la soirée, en retard, tout de suite, maintenant, encore, vite |
| u04 | Het weer | le temps, il fait beau, il fait chaud, il fait froid, pleuvoir, neiger, la pluie, la neige, le vent, le nuage, le ciel, l'étoile, la lune, chaud, froid, mauvais |
| u05 | In de stad | la ville, le magasin, le supermarché, la boulangerie, le marché, la poste, la gare, l'hôpital, le restaurant, le musée, la place, le cirque, le théâtre, le spectacle |
| u06 | Waar naartoe? | le train, l'avion, le métro, à pied, à droite, à gauche, tout droit, près, près de, en face de, entre, en haut, en bas, dedans, dehors, monter, descendre, entrer, rentrer, le départ |
| u07 | In huis | l'appartement, le salon, la salle à manger, la salle de bain, les toilettes, l'escalier, l'étage, le mur, le toit, le garage, l'armoire, le placard, le bureau, le canapé, la lampe, la clé |
| u08 | Ontbijt | le petit-déjeuner, le déjeuner, le goûter, le dîner, le repas, le beurre, la confiture, le thé, le café, le chocolat chaud, le biscuit, le sucre, la boisson, le sandwich, la crêpe, goûter, bon appétit, la poire, l'orange, le citron, le raisin |
| u09 | Aan tafel | la viande, le poulet, le jambon, le riz, les pâtes, les frites, la soupe, la salade, la pizza, le plat, le menu, le serveur, le verre, la tasse, la fourchette, le couteau, la cuillère, la bouteille, mettre la table |
| u10 | Op de boerderij | la campagne, la ferme, le fermier, le champ, l'herbe, la plante, la vache, le cochon, le mouton, la poule, le poussin, le canard, l'âne, la chèvre, le légume, la tomate, la carotte, la pomme de terre |
| u11 | Meer dieren | le serpent, l'ours, le crocodile, le zèbre, la grenouille, la tortue, le hamster, le chaton, le chiot, le perroquet, le dauphin, la baleine, le requin, la forêt, la rivière, le lac, le sable |
| u12 | Mensen | l'homme, la femme, l'enfant, le bébé, les gens, l'oncle, la tante, le cousin, la cousine, tout le monde, quelqu'un |
| u13 | Beroepen | le métier, le travail, travailler, le médecin, le docteur, le policier, le pompier, le boulanger, le vendeur, le facteur, le cuisinier, le chanteur |
| u14 | Hoe is hij? | gentil, méchant, drôle, sympa, fatigué, malade, fort, timide, sage, mince, gros, brun, roux, long, court, seul, super, génial |
| u15 | Au, mijn rug! | le corps, le visage, la dent, le ventre, le dos, le cou, avoir mal, la fièvre, la chemise, la chaussette, la casquette, le maillot de bain, le vêtement, s'habiller |
| u16 | Vrije tijd | la danse, la natation, le ski, le basket, le volley, le judo, la randonnée, la promenade, se promener, se baigner, la guitare, le piano, la photo, la bande dessinée, la trottinette, pratiquer, visiter, la visite, la sortie |
| u17 | Schoolvakken | la matière, les maths, la géographie, les sciences, l'histoire, l'anglais, la lecture, la leçon, les devoirs, la récréation, la cantine, le dictionnaire, la page, le crayon de couleur, la colle, découper, coller, apprendre, répéter, difficile |
| u18 | Hoera, een feest! | le cadeau, la bougie, la surprise, bon anniversaire, fêter, offrir, bravo, bienvenue, coucou, le programme, l'affiche |
| u19 | Bellen en mailen | le téléphone, téléphoner, appeler, l'ordinateur, internet, le mail, le journal, le magazine, l'article, le jeu vidéo, la vidéo |
| u20 | Zoeken en vinden | acheter, payer, chercher, trouver, perdre, oublier, attendre, savoir, partir, sortir |
| u21 | Opstaan en vertellen | se lever, se coucher, s'asseoir, raconter, présenter, se présenter, détester, aimer bien, tenir, observer, passer |
| u22 | Eerst en dan | d'abord, ensuite, puis, enfin, alors, donc, mais, parce que, toujours, jamais, souvent, parfois |
| u23 | Ons en jullie | notre, votre, leur, vous, tout, ensemble, un peu, assez, trop, mieux, mal, bien sûr, voici, là, rien, quelque chose |

## A2 (`fr-a2`, 30 units, 442 words)

| Unit | Title | Words |
|---|---|---|
| u01 | Gisteren en morgen | hier, avant-hier, après-demain, déjà, longtemps, plus tard, d'habitude, soudain, tout à coup, à tout à l'heure, depuis, tard, à l'heure, prochain, dernier, naître |
| u02 | Mijn dag | se réveiller, se laver, se brosser, se coiffer, s'endormir, se dépêcher, se reposer, le réveil, sonner, la brosse à dents, le dentifrice, la serviette, la douche, la baignoire, debout, en forme |
| u03 | Op reis | le voyage, voyager, la valise, les bagages, le sac à dos, la tente, le camping, l'hôtel, le billet, le ticket, le passeport, le plan, le souvenir, l'aéroport, l'arrivée, la carte postale |
| u04 | Landen en talen | le pays, le monde, l'Europe, allemand, espagnol, italien, belge, suisse, le correspondant |
| u05 | Ziek en weer beter | la gorge, le genou, l'épaule, le doigt, le cœur, la santé, le médicament, le rhume, la pharmacie, le dentiste, l'infirmier, tousser, se blesser, se casser, guérir, soigner |
| u06 | Hoe voel je je? | heureux, malheureux, fâché, fier, inquiet, surpris, calme, curieux, la joie, avoir peur, rire, pleurer, sourire, s'ennuyer, s'amuser, ennuyeux, intéressant, amusant |
| u07 | Dieren verzorgen | le vétérinaire, l'animal domestique, le poisson rouge, l'araignée, l'insecte, le papillon, l'abeille, la fourmi, le loup, le renard, l'écureuil, la cage, la niche, la queue, l'aile, la patte, la plume, le nid, sauvage, nourrir, garder, promener, s'occuper |
| u08 | Het weerbericht | la météo, nuageux, ensoleillé, l'orage, le brouillard, la température, le degré, l'arc-en-ciel, la boule de neige, le bonhomme de neige, la luge |
| u09 | In de natuur | la nature, l'île, la colline, l'océan, la vague, le désert, la grotte, le volcan, le rocher, la pierre, le bois, grimper |
| u10 | Onze planeet | l'environnement, la planète, la Terre, l'espace, la fusée, l'astronaute, la poubelle, les déchets, la pollution, protéger, jeter, recycler, le papier |
| u11 | Winkelen | l'argent, l'euro, le prix, cher, coûter, vendre, essayer, le client, le porte-monnaie, la librairie, la montre, la poche, la bague, le bracelet, le collier |
| u12 | Warme kleren | le jean, l'écharpe, le gant, le bonnet, la botte, les baskets, le pyjama, le parapluie, les lunettes de soleil, le costume, l'uniforme, enlever |
| u13 | Telefoon en computer | le téléphone portable, l'écran, la tablette, la radio, l'appareil photo, l'informatique, envoyer, recevoir, l'enveloppe, le timbre, utiliser, allumer, éteindre |
| u14 | Sport en wedstrijden | le match, l'équipe, le joueur, le but, le stade, la course, gagner, marquer, sauter, lancer, attraper, s'entraîner, la gymnastique, l'équitation, le foot, la balle, le roller, le skateboard, le patin |
| u15 | School en leren | le directeur, le maître, le camarade, la rentrée, l'emploi du temps, l'art, l'examen, l'erreur, se tromper, réviser, corriger, épeler, le cartable, le matériel, étudier, expliquer, facile, la phrase, absent |
| u16 | Mijn huis en mijn kamer | la pièce, le rez-de-chaussée, le grenier, la cave, le balcon, le couloir, le meuble, l'étagère, le tiroir, le miroir, le rideau, le coussin, l'oreiller, la couverture, le tapis, ranger, nettoyer, propre, sale |
| u17 | Mijn wijk | le quartier, le centre, culturel, la mairie, le pont, la banque, le château, l'église, la police, l'usine, interdit |
| u18 | Op straat | la route, le chemin, le parking, le trottoir, le feu, l'arrêt, la gare routière, le tram, le taxi, la moto, le camion, traverser, tourner, continuer, conduire |
| u19 | Lekker koken | la recette, cuisiner, la farine, le sel, le poivre, le miel, le yaourt, les céréales, la cerise, le champignon, l'oignon, le haricot, le petit pois, la saucisse, la tarte, le croissant |
| u20 | In de keuken | le dessert, le bol, la casserole, la poêle, le four, le frigo, couper, mélanger, cuire, délicieux, sucré, salé, commander |
| u21 | Beroepen en familie | l'acteur, l'artiste, le coiffeur, l'employé, l'ingénieur, le journaliste, le mécanicien, le photographe, le pilote, le roi, la reine, le mari, le fils, le jumeau, marié |
| u22 | Spelletjes | le cerf-volant, le puzzle, les échecs, collectionner, se déguiser, le déguisement, la couronne, cacher, se cacher, deviner |
| u23 | Kunst en avontuur | la peinture, peindre, l'instrument, le violon, la batterie, jouer de, la passion, l'aventure, explorer, le trésor, imaginer, inventer, rêver |
| u24 | Groter dan... | moins, meilleur, différent, pareil, léger, lourd, rapide, lent, haut, bas, dur, doux, plein, vide |
| u25 | Groot en klein | énorme, minuscule, large, étroit, profond, rond, carré, clair, foncé, sombre, bruyant, silencieux |
| u26 | Beroemd en rijk | célèbre, riche, pauvre, paresseux, intelligent, poli, étrange, bizarre, incroyable, dangereux, magnifique |
| u27 | Open of dicht? | excellent, occupé, libre, ouvert, fermé, important, ancien, parfait, vrai, faux, perdu |
| u28 | Praten en vragen | demander, discuter, la conversation, l'idée, penser, croire, espérer, être d'accord, remercier, s'excuser, proposer, accepter, refuser, décrire, chuchoter, crier, l'aide, partager, prêter, emprunter |
| u29 | Wat is er gebeurd? | tomber, devenir, revenir, casser, construire, réparer, se souvenir, se perdre, décider, pousser, tirer, toucher, suivre, disparaître, changer, grandir, rencontrer, réserver, vivre |
| u30 | Kleine woordjes | avoir besoin de, avoir envie de, presque, vraiment, seulement, peu, peut-être, chacun, eux, sans, contre, vers, la chance, attention, bon week-end |


These tables are generated from the unit files (`content/src/fr/<level>/NN-*.yaml`), which are the record of what each unit teaches.

## B1 (`fr-b1`, 20 units)

Audience: learners **from about 11 to adult** (the children who started at A1.1 are teenagers by B1; adults may take the
course), so sentences and texts are about school, friends, family, work, travel and society rather than toys and pets,
and everything stays family-safe. The word list's B1 lemmas come from the DELF B1 junior / scolaire sample papers
(attested), topic completions for the DELF B1 themes, and parity with the English B1 plan (`WORDLIST.md`, *B1*); each is
taught in exactly one unit or omitted with a reason in `content/src/fr/b1/pack.yaml`.

**Register.** *tu* between friends, classmates and family; *vous* to a teacher, a landlord, a shop or office, a stranger
(texts t06 and the interview texts), mirrored in Dutch as *je* / *u*.

**Grammar (B1, the DELF B1 junior descriptors; `content:trace -- fr` accepts these forms at B1).** *imparfait* against
*passé composé* (description vs event), *plus-que-parfait* (an earlier past: *il avait oublié*), *futur simple*,
*conditionnel présent* (politeness, wishes, *si* + imparfait), the passive (*être* + participe passé: *a été écrit*),
*subjonctif présent* after *il faut que, vouloir que, pour que, avant que, bien que*, after an emotion + *que* (*je suis
content que*) and after opinions in the negative (*je ne pense pas que*), *gérondif* (*en + participe présent*), relative
pronouns *qui, que, où* (*dont, lequel* omitted), the pronouns *y* and *en*, reported speech in the present, connectors of
cause, contrast and purpose. A magazine or notice addressing its readers with *vous* is rendered with Dutch *je* (t13, t16). Finite-verb
fill-ins name the French tense (*présent, imparfait, futur, passé composé*); a gap is never an infinitive or an elided form
(*s'inquiètent, m'énerve, j'étais* cannot be gaps).

The pilot unit (u01, *Samen*, two texts, locked) keeps *décorer, installer, le concours, le sujet, l'exposé,
hésiter*; no later unit teaches them again.

| Unit | Theme (grammar) | Words |
|---|---|---|
| u01 | Samen (pilot) | décorer, installer, concours, sujet, exposé, hésiter |
| u02 | Ik en de anderen (qui, que) | apparence, caractère, honnête, impoli, généreux, égoïste, bavard, sérieux, chauve, beauté, amitié, couple, se disputer, dispute, pardonner, promettre, promesse, respect, soutenir, confiance, relation, comportement, attitude, tolérant, adolescent, ado, adulte, âgé, aveugle, lien, contact, rapprocher, habitude, intimité, francophone |
| u03 | Gevoelens en meningen (je ne pense pas que + subj.) | jaloux, soulagé, stressé, gêné, honte, colère, tristesse, nerveux, s'inquiéter, inquiétant, étonné, enthousiaste, confiant, décevoir, énerver, bonheur, plaisir, stress, avis, opinion, à mon avis, argument, inconvénient, avantage, point, probablement, certainement, évidemment, apparemment, sembler, doute, raison, sens, réaction, refus, mécontentement, protester, rigoler, passionnant, motivant, motivé, motiver, indifférent, discussion, négatif, positif |
| u04 | Familie en feesten (imparfait / passé composé) | mariage, se marier, naissance, neveu, nièce, célébrer, cérémonie, tradition, traditionnel, mourir, mort, génération, vie, quotidien, festival, ambiance, occasion, réunir, réunion, souhaiter, merveille, fois, moment, plutôt, revivre, retrouver, souligner, inattendu |
| u05 | Wonen en huishouden (y, en) | propriétaire, loyer, louer, colocataire, plafond, chauffage, ménage, aspirateur, lave-vaisselle, machine à laver, linge, repasser, poussière, ampoule, matelas, fauteuil, salle, endroit, bâtiment, aménager, rénover, habitant, désordonné, déranger, bruit, tranquille, confortable, loger, hébergement, appareil, chantier, bricolage, équiper, vérifier, extérieur |
| u06 | Eten en gezondheid (si + présent, futur) | ingrédient, bouillir, épicé, goût, végétarien, addition, pourboire, serveuse, ajouter, douleur, blessure, ordonnance, urgence, ambulance, opération, sang, os, peau, respirer, maladie, traitement, médical, fatigue, estomac, soin, accident, gravement, repos, sauver, liquide, solide, humain, sentir |
| u07 | Sport en vrije tijd (gérondif) | entraîneur, champion, battre, passe-temps, pêche, jardinage, membre, jogging, yoga, gym, compétition, atelier, animateur, participer, participant, sportif, entraînement, terrain, piste, parcours, excursion, camper, camping-car, collectif, individuel, actif, passif, effort, défi, vitesse, récompense |
| u08 | Cultuur (passive) | exposition, scène, orchestre, roman, auteur, écrivain, poème, titre, réalisateur, jazz, classique, musicien, studio, enregistrement, répétition, production, édition, chronique, culture, interculturel, créer, représenter, thème, série, épisode, photographie, historien, historique, siècle, époque, inventeur, papeterie |
| u09 | Media en technologie | actualité, publicité, émission, journalisme, information, sondage, courriel, clavier, taper, écriture, manuel, télécharger, mot de passe, logiciel, application, imprimante, imprimer, cliquer, numérique, connexion, wi-fi, site, réseau, technologie, high-tech, contenu, révolution, annonce, source, dénoncer, utilisation, liste, progressivement, indiquer, signaler, interroger, évoquer |
| u10 | School en studie | lycée, lycéen, collège, collégien, étudiant, enseignant, enseigner, éducation, éduquer, apprentissage, biologie, chimie, physique, bulletin, échouer, réussir, diplôme, baccalauréat, université, formation, scolaire, extrascolaire, niveau, résultat, difficulté, échec, méthode, pédagogique, débutant, connaissance, étude, recherche, rechercher, oral, logique, correct, inutile, utile, compétent, note, pause, inscrire |
| u11 | Werk | collègue, patron, salaire, candidature, entretien, cv, embaucher, chômage, retraite, emploi, entreprise, stage, profession, professionnel, secteur, responsable, expérience, bénéficier, établissement, commercial, industriel, économie, économique, diriger, éducateur, spécialiste, spécialisé, maire, formulaire, assister, assurer, capable, exigence |
| u12 | Geld en mode | carte bancaire, monnaie, soldes, ticket de caisse, caisse, dépenser, économiser, tarif, réduction, gratuit, rembourser, consommateur, marque, taille, à la mode, coton, laine, cuir, bijou, mode, produit, service, choix, comparer, gaspiller, gaspillage, augmenter, baisser, financer, million, millier, accès |
| u13 | Reizen | vol, réservation, auberge de jeunesse, retard, douane, frontière, séjour, touriste, tourisme, touristique, voyageur, étranger, découverte, découvrir, annuler, prolonger, guide, guider, agence, accueillir, altitude, européen, indien, ouest, sud-ouest, ailleurs, partout, emmener, quitter, linguistique, échange, échanger, organiser, organisation, accompagner |
| u14 | Verkeer en de stad | circulation, embouteillage, carrefour, permis de conduire, freiner, garer, conducteur, véhicule, automobile, circuler, volant, piéton, cyclable, bicyclette, transport, transporter, déplacement, déplacer, direction, demi-tour, passage, klaxon, centre-ville, banlieue, port, côte, paysage, monument, avenue, impasse, région, commune, lieu, situer, autour, proche, moderne, aboyer, autonome, local |
| u15 | Milieu | climat, réchauffement climatique, énergie, espèce, tempête, inondation, écologique, plastique, polluer, préserver, durable, environnemental, ramasser, ressource, agriculture, agricole, naturel, équilibre, développement, écotourisme, sensibiliser, accumuler, tonne, métal, marin, courant, prévisible, valoriser, contribuer, dommage, air, geste, milieu |
| u16 | Samenleving | élection, voter, gouvernement, droit, voleur, prison, se plaindre, plainte, loi, citoyen, société, politique, président, association, bénévole, bénévolat, volontaire, solidaire, initiative, don, générosité, commissariat, sécurité, respecter, national, public, population, social, obliger, signe, preuve, cause, volonté, conscience, présence, limitation, enfermer, portefeuille, récupérer, résoudre |
| u17 | Tijd en maten | quinzaine, pour cent, mesurer, peser, poids, longueur, kilo, litre, kilomètre, mètre, dizaine, moitié, minimum, période, autrefois, désormais, actuellement, récemment, récent, durée, début, fin, matinée, horaire, régulier, fréquent, rarement, rapidement, durant, dès, lors de, futur, permanent, quasiment, tas, ordre |
| u18 | Verbindingswoorden (subjonctif) | cependant, pourtant, alors que, malgré, bien que, même si, par exemple, en effet, pour que, avant que, vouloir que, il faut que, afin de, car, puisque, lorsque, or, sinon, ainsi, également, davantage, surtout, autant, tellement, totalement, complètement, entièrement, extrêmement, parfaitement, simplement, facilement, réellement, différemment, autrement, finalement, normalement, exactement, selon, concernant, face à, via, grâce, malheureusement, peine |
| u19 | Werkwoorden | agir, améliorer, développer, permettre, réaliser, remplacer, atteindre, conclure, suffire, apparaître, considérer, concerner, correspondre, exister, éviter, exprimer, identifier, intégrer, intéresser, manquer, profiter, rendre, repérer, reproduire, retirer, servir, supporter, surprendre, tenter, terminer, varier, adapter, appliquer, apprécier, avancer, arrêter, composer, défendre, dépasser, dresser, habituer, remplir |
| u20 | Nuttige woorden | aspect, cas, chose, condition, contexte, domaine, effet, façon, manière, forme, type, moyen, objectif, problème, solution, situation, possibilité, nécessité, importance, intérêt, origine, particularité, facilité, rapport, circuit, cadre, groupe, projet, proposition, recommandation, conseil, possible, nécessaire, essentiel, principal, général, particulier, véritable, évident, idéal, réaliste, simple, sûr, juste, entier, seul (adj.), même, aucun, cela, celui, certain, tel, ordinaire, nombreux, plupart |

Omitted at B1 (`pack.yaml` `omit`, with reasons): *endormissement, désorganisation, saturation, antiécologique,
dégradation, blocage, fédération, constructeur, repeupler, extraire, acquis, auxquels, lequel, ci, ci-dessous, quelque,
dont, ah, oh, eh, distraction, excès, hall, forum*.

## B2 (`fr-b2`, 20 units, preview)

Audience: learners **from about 13 to adult**, family-safe. The B2 lemmas of the word list are the words of one topic group
per unit in `content/src/fr/wordlist-sources.yaml` (`WORDLIST.md`, *B2*: the DELF B2 junior / scolaire papers are
attest-only); each is taught in exactly one unit of this table, or omitted with a reason in `content/src/fr/b2/pack.yaml`
(*mademoiselle*). Themes follow the DELF B2 papers and the English and Dutch B2 courses (parity), and every unit has one
original text (reading, or a dialogue for t02, t05, t15, t19) of about 165–300 words with the B2 kinds: gapped text,
summary, multiple matching (t13), word formation, open cloze, key word transformation and listening completion.

**Register.** As at B1 (*tu* / *vous*, mirrored by *je* / *u*); essays, reviews and articles use the formal connectors.

**Grammar (B2; `content:trace -- fr` accepts these forms at B2).** Everything of B1, plus: *discours rapporté* with the
concordance des temps (u08), the passive in every tense, the *passif pronominal* and *on* (u09), the *irréel du passé*
(*si* + plus-que-parfait, conditionnel passé; u10), the compound relatives *lequel, auquel, duquel* and *dont* (u11), the
tenses of a narrative (u12), purpose with *pour que, afin que, de peur que, de sorte que* + subjonctif (u13), concession
(*bien que, quoique, même si, avoir beau, malgré, néanmoins, toutefois*; u14), double object pronouns and *y / en* with
verbs (u15), consequence (*par conséquent, si bien que, tellement … que*; u16), the subjonctif after impersonal
expressions (u17), the *participe présent* (u18), the connectors of an argument and *ce qui …, c'est …* (u19) and the
*futur antérieur* (u20). The conjugation tables gained *concevoir, rompre, convaincre* and the compounds *contredire,
prédire, interrompre*.

| Unit | Theme (grammar) | Words |
|---|---|---|
| u01 | Karakter en ambities (les pronoms relatifs dont, lequel, auquel) | ambitieux, ambition, déterminé, détermination, bourse, doué, talent, personnalité, sensible, têtu, modeste, impatient, motivation, réussite, surmonter, par hasard, modèle, passionné, remarquable, peu à peu, admirer, obstacle, persévérer, courage, courageux, fierté, remarquer, recommencer, auquel, encourager, persévérance |
| u02 | Studeren en leren (le subjonctif après il faut que, bien que, pour que, avant que) | révision, mémoriser, concentration, se concentrer, absence, théorique, pratique, décourager, obligatoire, facultatif, plagiat, évaluer, évaluation, contrôle, conseiller, rattraper, abandonner, élargir, efficace, curiosité, discipline, trimestre, redoubler, orientation, filière, enseignement, compréhension, en ligne, à distance |
| u03 | Werk en loopbaan (le conditionnel passé) | recruter, candidat, stagiaire, apprenti, indépendant, revenu, promotion, démissionner, licencier, supérieur, horaires, flexible, télétravail, responsabilité, exigeant, gratifiant, qualifié, employeur, salarié, contrat, pénurie, compétence, carrière, s'épanouir, tâche, collaborer, flexibilité, regretter |
| u04 | Geld en consumptie (exprimer la cause) | budget, abordable, dépense, dette, épargne, économies, achat, impulsif, paiement, sans contact, argent de poche, coût de la vie, luxe, richesse, pauvreté, investir, investissement, bénéfice, abonnement, tentation, enquête, facture, épargner, à cause de, étant donné que, faute de, en raison de |
| u05 | Wonen en de buurt (faire + infinitif) | locataire, agence immobilière, spacieux, voisinage, alentours, délabré, plombier, électricien, fuite, agrandissement, emménager, déménager, déménagement, s'installer, foyer, tâches ménagères, désordre, meublé, isolation, colocation, ascenseur, immeuble, réparation, électricité, logement, état, panne, prévoir, diminuer, fatigant, pire, faute, dessus, lumière |
| u06 | Gezondheid en sport (le gérondif) | mental, bien-être, s'étirer, muscle, guérison, symptôme, thérapie, prévention, alimentation, équilibré, mode de vie, sédentaire, surpoids, anxiété, épuisement, épuisé, méditation, dépendant, dépendance, rythme cardiaque, endurance, s'échauffer, réduire, sommeil, transpirer, grippe |
| u07 | Voeding en eetgewoonten (exprimer la quantité) | fade, bio, transformé, malbouffe, végétalien, protéine, vitamine, fibre, portion, appétit, affamé, récolte, restes, emballage, de saison, importé, allergie, allergique, produits laitiers, consommer, consommation, quantité, agriculteur, saveur, nourriture, contenir, produire, heureusement, faim dans le monde |
| u08 | Nieuws en media (le discours rapporté) | diffuser, rédacteur en chef, médias, influenceur, viral, abonné, s'abonner, fausses informations, rumeur, partial, prétendre, affirmer, nier, révéler, accuser, controversé, sensationnel, vie privée, tromper, trompeur, fiable, se répandre, presse, publier, publication, reconnaître, annoncer, liberté d'expression, reportage |
| u09 | Uitvindingen en technologie (la voix passive à tous les temps) | gadget, prototype, ingénieux, innovation, innovant, progrès, invention, technologique, intelligence artificielle, automatique, sans fil, brevet, données, pirate informatique, piratage, mettre au point, concevoir, tester, essai, laboratoire, chercheur, scientifique, fonctionner, machine, outil, connecté, électrique, chute, étonnant |
| u10 | Klimaat en milieu (l'irréel du passé) | changement climatique, gaz à effet de serre, empreinte carbone, sécheresse, canicule, fondre, glacier, niveau de la mer, menacer, pollué, jetable, recyclage, réutiliser, trier, énergie renouvelable, éolienne, panneau solaire, énergies fossiles, pétrole, militant, manifester, manifestation, pétition, signer, interdire, interdiction, impact, conséquence, urgent, catastrophe |
| u11 | Dieren en de natuur (les pronoms relatifs composés) | habitat, milieu naturel, en voie de disparition, disparition, protection, colonie, observation, survivre, survie, se reproduire, se nourrir, s'adapter, prédateur, proie, chasser, chasseur, réserve naturelle, biodiversité, écosystème, migrer, ruche, mammifère, aigle, falaise, oiseau marin, phoque, zoo, en captivité, duquel, limiter |
| u12 | Reizen en avontuur (les temps du récit) | brume, sentier, glissant, raide, pente, panique, paniquer, boussole, écho, refuge, itinéraire, destination, randonneur, mal du pays, choc culturel, bagages, escale, correspondance, décoller, atterrir, embarquer, s'orienter, vallée, sommet, escalader, imprévu, inoubliable, lentement, nord, sud |
| u13 | Engagement en vrijwilligerswerk (exprimer le but) | s'engager, engagement, engagé, collecte, collecter, don, faire un don, solidarité, banque alimentaire, sans-abri, précarité, exclusion, isolement, isolé, maison de retraite, maison de quartier, communauté, consacrer, enrichissant, empathie, réfugié, intégration, soutien, distribuer, reconnaissance, préjugé, fermeture, différence, afin que, de peur que, de sorte que |
| u14 | Muziek, film en kunst (exprimer la concession) | comédie musicale, pièce de théâtre, comédien, metteur en scène, mise en scène, décor, personnage, spectateur, applaudir, applaudissements, critique, chef-d'œuvre, œuvre, interpréter, émouvant, ému, décevant, original, créatif, talentueux, inspirer, entracte, succès, complet, voix, paroles, tomber amoureux, quoique, avoir beau, néanmoins, toutefois |
| u15 | Vriendschap en relaties (les doubles pronoms) | s'habituer, avoir l'habitude de, solitude, se sentir seul, timidité, confiance en soi, rejeter, rejet, harcèlement, harceler, se moquer, pression, influencer, influence, se réconcilier, excuses, jalousie, trahir, se confier, secret, compter sur, conflit, malentendu, tension, rompre, rupture, demi-frère, famille recomposée, belle-mère |
| u16 | Samenleving en generaties (exprimer la conséquence) | inégalité, égalité, discrimination, racisme, tolérance, diversité, vieillissement, vieillir, espérance de vie, retraité, impôt, service public, logement social, intergénérationnel, cohabiter, rendre service, tenir compagnie, défavorisé, favoriser, handicapé, accessible, par conséquent, si bien que, c'est pourquoi, entraîner, provoquer, tendance, majorité, minorité, en moyenne |
| u17 | Regels, rechten en de wet (l'obligation et la permission) | droit de vote, électeur, élire, parti, démocratie, ministre, autoriser, autorisation, obligation, avoir le droit de, majeur, mineur, citoyenneté, juge, tribunal, avocat, condamner, amende, punir, sanction, coupable, innocent, témoin, victime, justice, liberté, débat, maturité, il est temps que, inacceptable |
| u18 | Talen en communicatie (le participe présent) | bilingue, trilingue, bilinguisme, langue maternelle, langue étrangère, accent, prononciation, prononcer, vocabulaire, grammaire, orthographe, traduire, traduction, traducteur, néerlandophone, germanophone, couramment, maîtriser, maîtrise, progresser, immersion, s'exprimer, expression, communiquer, communication, signifier, mémoire, oser, identité, enfance, frontière linguistique |
| u19 | Debat en overtuigen (les articulateurs du discours argumenté) | d'une part, d'autre part, en outre, de plus, par ailleurs, en revanche, au contraire, certes, bref, en conclusion, convaincre, convaincant, persuader, réfuter, contredire, objection, nuancer, nuance, point de vue, position, prouver, compromis, orateur, jury, interrompre, parole, contre-argument, illustrer, thèse |
| u20 | Vooruitblikken (le futur antérieur) | avenir, prévision, prédire, incertain, incertitude, optimiste, pessimiste, espoir, inquiétude, souci, accomplir, priorité, à long terme, à court terme, étape, évoluer, évolution, fixer, mondial, mondialisation, international, d'ici, dès que, aussitôt que, une fois que, rêve, effrayant, sévère, gentillesse, soi-même |
