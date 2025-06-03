const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-config.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ventas-illapel.web.app/"
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

// Datos Webpay (usualmente los te da Transbank)
const comercio = {
  commerceCode: '597055555532',  // Ejemplo, este lo proporciona Webpay
  apiKey: 'd857be20-cdd7-430b-b86e-6ba7f0fb2f0b',  // Tu clave de API de Webpay
  urlWebpay: 'https://webpayplus.endpoint'  // URL proporcionada por Webpay
};

app.post('/crear-transaccion', async (req, res) => {
  try {
    const pedido = req.body;  // Los datos de tu carrito de compra

    // Preparar los datos para Webpay
    const transaccion = {
      commerce_code: comercio.commerceCode,
      buy_order: 'order_' + new Date().getTime(), // Un identificador único de la compra
      session_id: pedido.cliente.email, // El email del cliente es único
      amount: pedido.total, // Monto total de la compra
      return_url: 'http://tusitio.com/confirmar-pago', // La URL donde Webpay enviará el estado del pago
    };

    // Hacer la solicitud a Webpay para crear la transacción
    const response = await axios.post(comercio.urlWebpay + '/create', transaccion, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${comercio.apiKey}`
      }
    });

    const data = response.data;

    // Si la respuesta contiene URL y token, proceder con la redirección
    if (data.url && data.token) {
      res.json({
        url: data.url,  // Redirige a Webpay para el pago
        token: data.token,  // El token único de la transacción
      });
    } else {
      res.status(400).json({ error: 'No se pudo crear la transacción' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

// Confirmación de pago de Webpay (debe ser un endpoint donde Webpay haga una llamada para notificar)
app.post('/confirmar-pago', async (req, res) => {
  const { token } = req.body;

  // Verificar el pago con Webpay
  const response = await axios.post(comercio.urlWebpay + '/status', { token });

  if (response.data.status === 'AUTHORIZED') {
    // El pago fue autorizado, registra el pedido en Firebase
    const pedidoConfirmado = {
      cliente: req.body.cliente,
      productos: req.body.productos,
      total: req.body.total,
      fecha: new Date(),
      estado: 'Pagado',
    };

    await db.collection('pedidos').add(pedidoConfirmado);
    res.json({ success: true, message: 'Pedido confirmado' });
  } else {
    res.status(400).json({ error: 'Pago no autorizado' });
  }
});

// Iniciar el servidor
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
