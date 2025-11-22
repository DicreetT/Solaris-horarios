/**
 * Usuarios "reales" simulados.
 * Luego roles/flags podrían venir de Supabase.
 */
export const USERS = [
    {
        id: "thalia",
        name: "Thalia",
        email: "thaliaoliveros.solaris@gmail.com",
        password: "Thalia123",
        canAdminHours: true,
        isTrainingManager: false,
        isAdmin: true,
    },
    {
        id: "contable",
        name: "Heidy",
        email: "heidy.m.solaris@gmail.com",
        password: "heidy123",
        canAdminHours: false,
        isTrainingManager: false,
    },
    {
        id: "anabella",
        name: "Anabella",

        email: "anabellas.solaris@gmail.com",
        password: "anabella123",
        canAdminHours: false,
        isTrainingManager: false,
    },
    {
        id: "esteban",
        name: "Esteban",

        email: "contacto@solaris.global",
        password: "esteban123",
        canAdminHours: false,
        isTrainingManager: true,
    },
    {
        id: "itzi",
        name: "Itzi",

        email: "solarishuarte@gmail.com",
        password: "itziar123",
        canAdminHours: false,
        isTrainingManager: false,
    },
    {
        id: "fer",
        name: "Fer",

        email: "fadodami2503@gmail.com",
        password: "fer123",
        canAdminHours: false,
        isTrainingManager: false,
    },
];

// 🔗 Carpetas compartidas de Google Drive (con tus links reales)
export const DRIVE_FOLDERS = [
    {
        id: "inventario",
        label: "Carpeta de inventario",
        emoji: "📦",
        url: "https://drive.google.com/drive/folders/1TPqNMD5Yx6xYe0PuhjYRNLYrkT1KPSDL",
        users: ["anabella", "itzi", "esteban", "contable"],
    },
    {
        id: "conteo",
        label: "Conteo Canet lunes",
        emoji: "📦",
        url: "https://drive.google.com/drive/folders/1dCWJQMj1Ax7K3xJqiMaQqkK2QLIs9Fu-",
        users: ["anabella", "itzi", "esteban", "thalia"],
    },
    {
        id: "etiquetas",
        label: "Carpeta de etiquetas",
        emoji: "🏷️",
        url: "https://drive.google.com/drive/folders/1jaojxGMiWLaLxNWKcEMXv4XKM6ary2Vg",
        users: ["anabella", "esteban", "itzi", "fer"],
    },
    {
        id: "facturacion",
        label: "Carpeta de facturación",
        emoji: "📑",
        url: "https://drive.google.com/drive/folders/1MffbVp8RIcQPM0PRBqllYPLtpv-ZV5Vd",
        users: ["esteban", "itzi", "contable"],
    },
];
