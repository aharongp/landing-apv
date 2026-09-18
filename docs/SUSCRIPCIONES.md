# Membresías APV Motors

## Planes implementados

| Beneficio | Gratis | APV Plus · US$97/año | APV Premium · US$297/año |
|---|---|---|---|
| Inventario, favoritos y atención personalizada | Sí | Sí | Sí |
| Reporte del historial elaborado por APV Motors | Sí | Sí | Sí |
| Descuento sobre fee APV | No | US$100 | US$200 |
| Descuento en asesoría completa de 60 minutos | No | US$30 | US$40 |
| Precio Quick Call de 60 minutos | US$99 | US$69 | US$59 |
| Asesoría incluida cada año pagado | No | 20 minutos | 60 minutos |

Los planes se renuevan anualmente. El descuento en fees APV aplica por vehículo. La asesoría incluida se concede una vez por cada año pagado. Express cuesta US$39 (20 min); Quick Call US$99 (60 min); Sesión Maestra US$297 (90 min); Acompañamiento US$497 (dos sesiones de 50 min). Los descuentos de asesoría de la membresía aplican únicamente a Quick Call. Checkout permanece deshabilitado hasta configurar Stripe.

## Experiencia de venta

- Comparación pública de tres planes; acceso desde navegación y cuenta. Plus se destaca como opción para la próxima compra, sin afirmar que es el más popular.
- Aviso discreto en el catálogo, descartable durante siete días. Se oculta a suscriptores de pago.
- Ahorro contextual junto al fee APV de la calculadora. Se separa el precio de la membresía del precio del carro y de las tarifas de Copart.
- Cuenta con beneficios disponibles, solicitud de asesoría, estado de pago, vencimiento y acceso a gestionar o cancelar.
- Sin ventanas de salida, escasez artificial, plan de pago preseleccionado ni bloqueo de favoritos/inventario gratis.

Fuentes consultadas: [Baymard: UX de suscripciones y precios visibles](https://baymard.com/research-articles/new-research-consumables-subscription-services), [NN/g: mostrar precios](https://www.nngroup.com/articles/show-price/), [Stripe: webhooks de suscripciones](https://docs.stripe.com/billing/subscriptions/webhooks), [Stripe: portal del cliente](https://docs.stripe.com/customer-management/integrate-customer-portal).

## Configuración

Empieza con Stripe en modo de prueba. Configura en `.env`:

```dotenv
PUBLIC_APP_URL=https://cars.apvmotorusa.com
STRIPE_SECRET_KEY=...
BILLING_INTERVAL=year
BILLING_CONSULTATION_CADENCE=period
BILLING_FEE_SCOPE=per_vehicle
CONSULTATION_60_PRICE_USD=99
```

Los términos confirmados son `year`, `period` y `per_vehicle`. El servidor rechaza precios mensuales de Stripe.

1. Ejecuta `npm run stripe:setup` para ver la configuración propuesta sin crear objetos.
2. Cuando los importes y términos estén confirmados, `npm run stripe:setup -- --apply` crea o reutiliza los productos y precios, configura el portal y el webhook. No crea suscripciones ni cargos. Usa la cuenta indicada por la clave y distingue prueba/producción.
3. El resultado se guarda en `data/stripe-setup-test.env` o `data/stripe-setup-live.env`, excluido de Git y con permisos privados. Copia `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PREMIUM`, `STRIPE_PORTAL_CONFIGURATION` y `STRIPE_WEBHOOK_SECRET` a `.env` y a las variables del servicio en EasyPanel. Nunca publiques las claves.
4. Publica mediante Deploy en EasyPanel. Stripe notificará a `https://cars.apvmotorusa.com/api/stripe/webhook`.
5. Prueba alta, rechazo de pago, renovación, cambio de plan y cancelación con Stripe de prueba antes de cambiar a claves y precios de producción. Configura la identidad comercial, recibos y recuperación de pagos en Stripe. La configuración de impuestos y política de reembolsos depende de la operación de APV; este código no añade impuestos ni inventa una política de reembolsos.

## Reglas de cobro y beneficios

- El servidor valida USD, importe exacto, precio recurrente, frecuencia y modo de Stripe. El navegador solo manda el identificador del plan.
- Checkout exige sesión de APV; los clientes de Stripe se enlazan por ID de usuario, no por correo. Se reutilizan sesiones abiertas y se impiden dobles suscripciones con comprobación en Stripe, idempotencia y bloqueo persistente.
- Las notificaciones usan el cuerpo original, firma verificada y registro de eventos procesados. Para evitar regresiones por eventos fuera de orden, se consulta el estado actual de la suscripción.
- Los beneficios se activan tras verificar suscripción activa y factura pagada del precio correspondiente. Una vuelta desde Checkout por sí sola no activa beneficios. Un cambio de plan pendiente de pago no concede el descuento superior.
- La cancelación del portal detiene la renovación al final del período pagado. Una cancelación inmediata en Stripe revoca beneficios. Los pagos vencidos no prolongan beneficios más allá del tiempo pagado.
- Los aumentos de plan en el portal se facturan con prorrateo. Las reducciones se programan al final del período. Una asesoría incluida ya solicitada cuenta como usada en ese período, incluso si luego se cambia de plan.
- El descuento se muestra en la calculadora, se calcula de nuevo en el backend y queda registrado con la intención de puja; nunca se acepta un descuento enviado por el navegador. El resumen de Kommo informa del plan verificado al solicitar la puja.
- Reportes y asesorías se solicitan desde la web y se atienden manualmente desde la bandeja **Solicitudes de miembros** de `/admin`. Los historiales los elabora el equipo de APV Motors. Las citas se coordinan manualmente. Una solicitud no equivale a una cita confirmada ni a un reporte ya entregado.
- Una asesoría incluida no puede reservarse dos veces. Se concede una por cada año pagado; no se acumulan asesorías de períodos vencidos.
- Si se reembolsa manualmente un pago en Stripe, debe revisarse/cancelarse también la suscripción: el reembolso por sí solo no cancela una suscripción en Stripe.

## Pruebas

`npm test` incluye firmas inválidas, eventos duplicados/fuera de orden, importes incorrectos, doble Checkout, beneficios tras pago, cancelación al vencimiento, cambios impagos y redención única. Las pruebas de Billing usan el verificador oficial de firmas y un cliente simulado para llamadas de cobro; no son una certificación de conexión con una cuenta real de Stripe.
