# Control de acceso | Laguna de Kaan Luum

Aplicación local para registrar brazaletes, controlar un aforo máximo de 50
personas y consultar la operación diaria del cenote.

## Requisitos

- Node.js 20, 22, 23 o 24
- npm

## Instalación

```powershell
cd kaan-luum
npm install
npm start
```

Abre `http://localhost:3000`.

Para usarla desde teléfonos conectados a la misma red Wi-Fi, consulta la IP de
la computadora con `ipconfig` y abre `http://IP-DE-LA-COMPUTADORA:3000`.
Puede ser necesario permitir Node.js en el Firewall de Windows para redes
privadas.

## Instalar en iPhone

La versión publicada funciona como PWA. En el iPhone:

1. Abre `https://kaan-luum.vercel.app` en Safari.
2. Toca el botón **Compartir**.
3. Selecciona **Agregar a pantalla de inicio**.
4. Confirma con **Agregar**.

La app aparecerá con su propio icono y se abrirá sin la barra del navegador.
La interfaz básica queda disponible sin conexión, pero consultar la base de
datos y registrar entradas o salidas requiere internet. Las operaciones no se
guardan en una cola offline para evitar duplicados y errores de aforo.

## Uso con lector

Un lector USB de códigos de barras funciona como teclado. En las pantallas
Entrada y Salida, escanea el folio; el Enter que envía el lector registra el
movimiento automáticamente. Después de una entrada correcta, el campo se limpia
y recupera el foco.

## Tarifas configuradas

- Niño de 3 a 11 años: $100
- INAPAM: $150
- Tulumnense con INE: $150
- Mexicano o residente: $250
- Persona con discapacidad: $250
- Extranjero: $350
- Dron: $250 adicional
- Apnea: $300 adicional
- Buzo: $350 adicional

Los servicios adicionales se cobran y guardan con la entrada, pero no modifican
el aforo.

## Datos y respaldo

La base se crea como `kaan_luum.db` en la carpeta del proyecto. Con el servidor
detenido, respalda ese archivo para conservar todos los registros. Los archivos
`kaan_luum.db-wal` y `kaan_luum.db-shm` pueden aparecer mientras el servidor
está encendido y son parte normal de SQLite.

## Despliegue en Vercel

En local se utiliza SQLite. En Vercel se requiere PostgreSQL persistente porque
el sistema de archivos de las funciones no conserva una base SQLite.

1. Abre el proyecto `kaan-luum` en Vercel.
2. En **Storage** o **Marketplace**, instala **Neon Postgres**.
3. Conecta el recurso a `kaan-luum` para Production y Preview.
4. Confirma que Vercel haya creado la variable `DATABASE_URL`.
5. Vuelve a desplegar la rama `main`.

El esquema y los índices se crean automáticamente en la primera consulta. No
copies `kaan_luum.db` al repositorio ni a Vercel.

## Pruebas

```powershell
npm test
```

## API

- `POST /api/entrada`
- `POST /api/salida`
- `GET /api/dashboard`
- `GET /api/historial`
- `GET /api/adentro`
- `GET /api/reportes`
- `GET /api/exportar`
- `GET /api/catalogo`

La app no carga recursos desde internet, por lo que funciona sin conexión dentro
de la red local.
