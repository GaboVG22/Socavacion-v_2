# HidroSed · Hidráulica, Transporte de Sedimentos y Socavación

Aplicación estática compatible con GitHub Pages. No requiere npm, Vite, build ni servidor.

## Funciones de esta versión

- Crear N secciones de río con separación editable.
- Marcar secciones dentro de una curva del río y aplicar un factor preliminar de ajuste.
- Dibujar secciones manualmente con lápiz o digitalizar puntos.
- Cargar imágenes de secciones como fondo y trazar sobre ellas.
- Escalar la ventana de dibujo a unidades reales.
- Ingresar granulometría y calcular D50, D84, D90 y Dm.
- Calcular propiedades hidráulicas por sección: A, P, R, h, V, Froude y tensión de fondo.
- Calcular transporte de sedimentos mediante Meyer-Peter-Müller con corrección de rugosidad.
- Calcular socavación general granular mediante Lischtvan-Levediev.
- Exportar resultados a CSV, proyecto a JSON y reporte HTML.

## Uso rápido

1. Abra `index.html` en el navegador.
2. Defina número de secciones y separación.
3. Seleccione una sección activa.
4. En “Dibujo / Imagen”, dibuje el perfil o cargue una imagen y trace la línea de terreno.
5. Guarde la geometría.
6. Ingrese o calcule granulometría.
7. Revise Q, pendiente, Manning, D50, D84, D90, Dm y factor de curva.
8. Ejecute “Calcular”.

## Publicar en GitHub Pages

Suba estos archivos a un repositorio:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Luego active GitHub Pages desde Settings → Pages → Deploy from branch → main → root.

## Alcance técnico

Esta aplicación es una herramienta preliminar para revisar y comparar escenarios. No reemplaza levantamientos topobatimétricos, calibración hidráulica, campañas granulométricas, modelos 1D/2D ni revisión profesional.
