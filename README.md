# Pedido WhatsApp (mobile)

App web simple para tomar pedidos y enviarlos por WhatsApp en formato prolijo.

## Uso rapido

1. Abri `index.html` en el navegador del celular.
2. Elegi productos y cantidades.
3. Toca **Enviar Pedido por WhatsApp**.

## Links por linea

- `fibrofacil/index.html`: abre la app para MyM Fibrofacil.
- `pino/index.html`: abre la app para MyM Pino.
- Ambos links redirigen al `index.html` compartido usando `?linea=...`.

## Configuracion

- Numeros de destino: editar `SALES_LINES` en `app.js`.
  - Formato ejemplo: `5491112345678` (sin `+`, sin espacios).
- Catalogo: se carga desde Google Sheets.

## Estructura

- `index.html`: interfaz mobile compartida.
- `app.js`: logica de categorias, busqueda, cantidades y mensaje a WhatsApp.
- `fibrofacil/index.html`: entrada para la linea Fibrofacil.
- `pino/index.html`: entrada para la linea Pino.
