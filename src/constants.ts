import type { User, DriveFolder } from './types';

/**
 * Usuarios "reales" simulados.
 * Luego roles/flags podrían venir de Supabase.
 */
// UUID real de Esteban en Supabase
export const ESTEBAN_ID = "07d58adc-8c82-458d-ba48-f733ec706c7c";

export const USERS: User[] = [
    {
        id: "thalia",
        name: "Thalia",
        email: "thaliaoliveros.solaris@gmail.com",
        password: "Thalia123",
        isTrainingManager: false,
        isAdmin: true,
    },
    {
        id: "contable",
        name: "Heidy",
        email: "heidy.m.solaris@gmail.com",
        password: "heidy123",
        isTrainingManager: false,
    },
    {
        id: "anabella",
        name: "Anabella",

        email: "anabellas.solaris@gmail.com",
        password: "anabella123",
        isTrainingManager: false,
    },
    {
        id: ESTEBAN_ID,
        name: "Esteban",

        email: "contacto@solaris.global",
        password: "esteban123",
        isTrainingManager: true,
    },
    {
        id: "itzi",
        name: "Itzi",

        email: "solarishuarte@gmail.com",
        password: "itziar123",
        isTrainingManager: false,
    },
    {
        id: "fer",
        name: "Fer",

        email: "fadodami2503@gmail.com",
        password: "fer123",
        isTrainingManager: false,
    },
];

// 🔗 Carpetas compartidas de Google Drive (con tus links reales)
export const DRIVE_FOLDERS: DriveFolder[] = [
    {
        id: "inventario",
        label: "Carpeta de inventario",
        description: "Gestión y control de stock y existencias.",
        emoji: "📦",
        url: "https://drive.google.com/drive/folders/1TPqNMD5Yx6xYe0PuhjYRNLYrkT1KPSDL",
        users: ["anabella", "itzi", ESTEBAN_ID, "contable", "thalia"],
    },
    {
        id: "conteo",
        label: "Conteo Canet lunes",
        description: "Registro semanal de conteo en la sede Canet.",
        emoji: "📊",
        url: "https://drive.google.com/drive/folders/1dCWJQMj1Ax7K3xJqiMaQqkK2QLIs9Fu-",
        users: ["anabella", "itzi", ESTEBAN_ID, "thalia"],
    },
    {
        id: "etiquetas",
        label: "Carpeta de etiquetas",
        description: "Archivos de impresión y diseño de etiquetas.",
        emoji: "🏷️",
        url: "https://drive.google.com/drive/folders/1jaojxGMiWLaLxNWKcEMXv4XKM6ary2Vg",
        users: ["anabella", ESTEBAN_ID, "itzi", "fer", "thalia"],
    },
    {
        id: "facturacion",
        label: "Carpeta de facturación",
        description: "Documentos, facturas y registros contables.",
        emoji: "📑",
        url: "https://drive.google.com/drive/folders/1MffbVp8RIcQPM0PRBqllYPLtpv-ZV5Vd",
        users: [ESTEBAN_ID, "itzi", "contable", "thalia"],
    },
    {
        id: "facturas_pagos",
        label: "Facturas pagos proveedores",
        description: "Gestión de facturas y pagos a proveedores.",
        emoji: "🧾",
        url: "https://drive.google.com/drive/folders/1NWhx6o-Kqbd6m9xMXgbzVBtm0ny8e6zY?usp=sharing",
        users: ["contable", "thalia"],
    },
    {
        id: "protocolos",
        label: "PROTOCOLOS",
        description: "Protocolos y procedimientos operativos.",
        emoji: "📋",
        url: "https://drive.google.com/drive/folders/1JoWr3w-anNkyrqGVTzZovTqK44ixm5c2?usp=sharing",
        users: ["thalia", "contable", "anabella", ESTEBAN_ID, "itzi", "fer"],
    },
];
