import type { User, DriveFolder } from './types';

/**
 * Usuarios "reales" simulados.
 * Luego roles/flags podrían venir de Supabase.
 */
// UUID real de Esteban en Supabase
export const ESTEBAN_ID = "07d58adc-8c82-458d-ba48-f733ec706c7c";
export const CARLOS_EMAIL = "carlos@solaris.global";

export const USERS: User[] = [
    {
        id: "1c42e44a-7e58-4c86-94ca-404061f8863d", // thalia
        name: "Thalia",
        email: "thaliaoliveros.solaris@gmail.com",
        isTrainingManager: false,
        isAdmin: true,
    },
    {
        id: "b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6", // contable
        name: "Heidy",
        email: "heidy.m.solaris@gmail.com",
        isTrainingManager: false,
    },
    {
        id: "6bafcb97-6a1b-4224-adbb-1340b86ffeb9", // anabella
        name: "Anabella",
        email: "anabellas.solaris@gmail.com",
        isTrainingManager: false,
    },
    {
        id: ESTEBAN_ID,
        name: "Esteban",
        email: "contacto@solaris.global",
        isTrainingManager: true,
    },
    {
        id: "cb5d2e6e-9046-4b22-b509-469076999d78", // itzi
        name: "Itzi",
        email: "solarishuarte@gmail.com",
        isTrainingManager: false,
    },
    {
        id: "4ca49a9d-7ee5-4b54-8e93-bc4833de549a", // fer
        name: "Fer",
        email: "fadodami2503@gmail.com",
        isTrainingManager: false,
    },
    {
        id: "00000000-0000-4000-8000-0000000000c4", // Placeholder local config, runtime id comes from session
        name: "Carlos",
        email: CARLOS_EMAIL,
        isTrainingManager: false,
        isRestricted: true,
    },
];

// 🔗 Carpetas compartidas de Google Drive (con tus links reales)
export const DRIVE_FOLDERS: DriveFolder[] = [
    {
        id: "inventario",
        label: "CARPETA DE INVENTARIO",
        description: "Gestión y control de stock y existencias.",
        emoji: "📦",
        url: "https://drive.google.com/drive/folders/1TPqNMD5Yx6xYe0PuhjYRNLYrkT1KPSDL",
        users: ["6bafcb97-6a1b-4224-adbb-1340b86ffeb9", "cb5d2e6e-9046-4b22-b509-469076999d78", ESTEBAN_ID, "b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6", "1c42e44a-7e58-4c86-94ca-404061f8863d"],
    },
    {
        id: "conteo",
        label: "CONTEO CANET LUNES",
        description: "Registro semanal de conteo en la sede Canet.",
        emoji: "📊",
        url: "https://drive.google.com/drive/folders/1dCWJQMj1Ax7K3xJqiMaQqkK2QLIs9Fu-",
        users: ["6bafcb97-6a1b-4224-adbb-1340b86ffeb9", "cb5d2e6e-9046-4b22-b509-469076999d78", ESTEBAN_ID, "1c42e44a-7e58-4c86-94ca-404061f8863d"],
    },
    {
        id: "etiquetas",
        label: "CARPETA DE ETIQUETAS",
        description: "Archivos de impresión y diseño de etiquetas.",
        emoji: "🏷️",
        url: "https://drive.google.com/drive/folders/1jaojxGMiWLaLxNWKcEMXv4XKM6ary2Vg",
        users: ["6bafcb97-6a1b-4224-adbb-1340b86ffeb9", ESTEBAN_ID, "cb5d2e6e-9046-4b22-b509-469076999d78", "4ca49a9d-7ee5-4b54-8e93-bc4833de549a", "1c42e44a-7e58-4c86-94ca-404061f8863d"],
    },
    {
        id: "facturacion",
        label: "FACTURACION CANET",
        description: "Documentos, facturas y registros contables.",
        emoji: "📑",
        url: "https://drive.google.com/drive/folders/1MffbVp8RIcQPM0PRBqllYPLtpv-ZV5Vd",
        users: [ESTEBAN_ID, "cb5d2e6e-9046-4b22-b509-469076999d78", "b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6", "1c42e44a-7e58-4c86-94ca-404061f8863d"],
    },
    {
        id: "facturas_pagos",
        label: "FACTURAS PAGOS PROVEEDORES",
        description: "Gestión de facturas y pagos a proveedores.",
        emoji: "🧾",
        url: "https://drive.google.com/drive/folders/1NWhx6o-Kqbd6m9xMXgbzVBtm0ny8e6zY?usp=sharing",
        users: ["b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6", "1c42e44a-7e58-4c86-94ca-404061f8863d"],
    },
    {
        id: "protocolos",
        label: "PROTOCOLOS",
        description: "Protocolos y procedimientos operativos.",
        emoji: "📋",
        url: "https://drive.google.com/drive/folders/1JoWr3w-anNkyrqGVTzZovTqK44ixm5c2?usp=sharing",
        users: ["1c42e44a-7e58-4c86-94ca-404061f8863d", "b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6", "6bafcb97-6a1b-4224-adbb-1340b86ffeb9", ESTEBAN_ID, "cb5d2e6e-9046-4b22-b509-469076999d78", "4ca49a9d-7ee5-4b54-8e93-bc4833de549a"],
    },
];
