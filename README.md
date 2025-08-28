# 🧶 Emy’Crochet – Site vitrine

**Emy’Crochet** est un site vitrine présentant mes créations artisanales au crochet.  
L’objectif : mettre en valeur mes réalisations, expliquer les délais de fabrication et permettre un contact direct avec les visiteurs.

Ce site n’est pas un e-commerce : il n’y a pas de panier ni de paiement en ligne.  
Les visiteurs peuvent consulter les créations et me contacter directement via le formulaire ou par e-mail.

---

## 🚀 Fonctionnalités

- **Accueil (Home)** : aperçu de créations mises en avant.
- **Boutique (Catalogue vitrine)** : liste des créations avec photos, descriptions, tailles, options et délais indicatifs.
- **Carrousels d’images** avec lazy-loading et chargement progressif pour améliorer les performances.
- **Bandeau Atelier** : délais de confection affichés dynamiquement à partir d’un Google Sheet.
- **Formulaire de contact** (Formspree ou autre backend) avec compteur de caractères et message de confirmation.
- **Optimisations de performance** :
  - Lazy loading (`loading="lazy"` + `decoding="async"`)
  - IntersectionObserver pour charger uniquement les images visibles
  - Script simplifié sans panier, livraison ni paiement

---

## 🛠️ Stack technique

- **HTML5 / CSS3 / JavaScript (ES6+)**
- **[Tailwind CSS](https://tailwindcss.com/)** (compilation CLI)
- **Google Sheets** pour la gestion des créations (TSV export)
- **Déploiement** : [Vercel](https://vercel.com/)

---

## 📦 Installation & Développement

### 1. Cloner le projet

```bash
git clone https://github.com/ton-profil/emycrochet.git
cd emycrochet
2. Installer les dépendances (si tu ajoutes un package.json)
npm install
```

3. Compiler Tailwind en mode développement
   Le projet utilise Tailwind CLI.
   La commande suivante compile design/input.css vers css/style.css et reste en veille (--watch) :
   npx @tailwindcss/cli -i ./design/input.css -o ./css/style.css --watch
   -i : chemin vers ton fichier source contenant les directives Tailwind (@tailwind base; @tailwind components; @tailwind utilities;)
   -o : fichier de sortie compilé
   --watch : recompile automatiquement à chaque modification
4. Lancer un serveur de dev (au choix)
   Par exemple avec VS Code + extension Live Server, ou avec :
   npx serve .
   Puis ouvre http://localhost:3000.

## 🖼️ Organisation des fichiers

emycrochet/
│
├── index.html # Page d’accueil
├── boutique.html # Catalogue vitrine
├── contact.html # Formulaire de contact
├── a-propos.html # Présentation
│
├── design/
│ └── input.css # Fichier Tailwind source
├── css/
│ └── style.css # CSS généré (ne pas éditer directement)
│
├── js/
│ └── script.js # Logique front (fetch produits, carrousel, lazyload…)
│
└── images/ # Images des créations

## 🌱 Améliorations possibles

- **Accessibilité (a11y) :** ajouter ARIA labels, vérifier contrastes, navigation clavier.
- **SEO :** titres uniques, balises meta et alt optimisés.
- **Images :** exporter en WebP/AVIF + redimension automatique (Vercel Image Optimization ou build script).
- **Dark mode :** activer via Tailwind (dark:).
- **Filtrage / recherche :** par type de création, taille ou couleur.
- **Blog / actualités :** présenter mes nouveautés, conseils ou tutoriels crochet.
- **Multilingue :** version FR/EN pour élargir la portée.

## 📄 Licence

Projet personnel – © 2025 Emy’Crochet.
Usage libre pour consultation, pas de réutilisation commerciale sans autorisation.
