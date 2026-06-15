const nodemailer = require('nodemailer')

function mailConfig() {
  const user = String(process.env.GMAIL_USER || '').trim()
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').trim()
  const from = String(process.env.MAIL_FROM || user).trim()
  return { user, pass, from }
}

function isMailConfigured() {
  const { user, pass } = mailConfig()
  return Boolean(user && pass)
}

function makeTransporter() {
  const { user, pass } = mailConfig()
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

async function sendPasswordResetOtpEmail({ to, otp, expiresInMinutes }) {
  const { from } = mailConfig()
  if (!isMailConfigured()) {
    throw new Error('Email service is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD')
  }
  const transporter = makeTransporter()
  await transporter.sendMail({
    from,
    to,
    subject: 'Aashmika Designs password reset OTP',
    text: `Your Aashmika Designs password reset OTP is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">Reset your Aashmika Designs password</h2>
        <p style="margin:0 0 12px;">Use this one-time password (OTP):</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:0 0 12px;">${otp}</p>
        <p style="margin:0 0 12px;">This OTP expires in ${expiresInMinutes} minutes.</p>
        <p style="margin:0;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  })
}

async function sendOrderConfirmationEmail({ to, orderId, customerName, total, itemCount }) {
  const { from } = mailConfig()
  if (!isMailConfigured()) return false
  const transporter = makeTransporter()
  const safeName = String(customerName || 'Customer').trim() || 'Customer'
  const safeOrderId = String(orderId || '').trim() || 'your order'
  const amount = Number(total || 0).toLocaleString('en-IN')
  const count = Math.max(0, Number(itemCount || 0))
  await transporter.sendMail({
    from,
    to,
    subject: `Order confirmed: ${safeOrderId}`,
    text: `Hi ${safeName}, your order ${safeOrderId} has been placed successfully. Items: ${count}. Total: INR ${amount}. Our team will share shipping updates soon.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">Thanks for shopping with Aashmika Designs</h2>
        <p style="margin:0 0 8px;">Hi ${safeName}, your order has been placed successfully.</p>
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${safeOrderId}</p>
        <p style="margin:0 0 6px;"><strong>Items:</strong> ${count}</p>
        <p style="margin:0 0 12px;"><strong>Total:</strong> INR ${amount}</p>
        <p style="margin:0;">We will send tracking details once your order is dispatched.</p>
      </div>
    `,
  })
  return true
}

function adminNotifyEmail() {
  return String(process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim()
}

function formatPaymentLabel(method) {
  const key = String(method || '').trim().toLowerCase()
  if (key === 'razorpay' || key === 'online' || key === 'upi' || key === 'card') return 'Online (Razorpay)'
  return 'Cash on delivery'
}

async function sendAdminNewOrderEmail({
  orderId,
  customerName,
  customerPhone,
  customerEmail,
  total,
  itemCount,
  paymentMethod,
}) {
  const to = adminNotifyEmail()
  if (!to || !isMailConfigured()) return false
  const { from } = mailConfig()
  const transporter = makeTransporter()
  const safeOrderId = String(orderId || '').trim() || 'New order'
  const amount = Number(total || 0).toLocaleString('en-IN')
  const count = Math.max(0, Number(itemCount || 0))
  const payLabel = formatPaymentLabel(paymentMethod)
  const name = String(customerName || 'Customer').trim() || 'Customer'
  const phone = String(customerPhone || '').trim()
  const email = String(customerEmail || '').trim()
  await transporter.sendMail({
    from,
    to,
    subject: `New order: ${safeOrderId}`,
    text: [
      `New storefront order ${safeOrderId}`,
      `Customer: ${name}`,
      phone ? `Phone: ${phone}` : '',
      email ? `Email: ${email}` : '',
      `Items: ${count}`,
      `Total: INR ${amount}`,
      `Payment: ${payLabel}`,
      '',
      `Open admin → Orders → ${safeOrderId} to fulfill.`,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">New order received</h2>
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${safeOrderId}</p>
        <p style="margin:0 0 6px;"><strong>Customer:</strong> ${name}</p>
        ${phone ? `<p style="margin:0 0 6px;"><strong>Phone:</strong> ${phone}</p>` : ''}
        ${email ? `<p style="margin:0 0 6px;"><strong>Email:</strong> ${email}</p>` : ''}
        <p style="margin:0 0 6px;"><strong>Items:</strong> ${count}</p>
        <p style="margin:0 0 6px;"><strong>Total:</strong> INR ${amount}</p>
        <p style="margin:0 0 12px;"><strong>Payment:</strong> ${payLabel}</p>
        <p style="margin:0;">Sign in to admin → <strong>Orders</strong> → open <strong>${safeOrderId}</strong> to add tracking and update status.</p>
      </div>
    `,
  })
  return true
}

async function sendAdminLowStockEmail({
  productName,
  sku,
  variantName,
  available,
  threshold,
  onHand,
  reserved,
}) {
  const to = adminNotifyEmail()
  if (!to || !isMailConfigured()) return false
  const { from } = mailConfig()
  const transporter = makeTransporter()
  const name = String(productName || 'Product').trim()
  const skuLabel = String(sku || '').trim() || '—'
  const variant = String(variantName || '').trim()
  const avail = Number(available) || 0
  const thresh = Number(threshold) || 0
  const hand = Number(onHand) || 0
  const res = Number(reserved) || 0
  const variantLine = variant ? ` · ${variant}` : ''

  try {
    await transporter.sendMail({
      from,
      to,
      subject: `Low stock: ${name}${variantLine}`,
      text: [
        `Reorder alert — ${name}${variantLine}`,
        `SKU: ${skuLabel}`,
        `Available: ${avail} (on hand ${hand}, reserved ${res})`,
        `Threshold: ${thresh}`,
        '',
        'Open admin → Inventory to restock or adjust counts.',
      ].join('\n'),
      html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">Low stock — reorder needed</h2>
        <p style="margin:0 0 6px;"><strong>Product:</strong> ${name}${variant ? ` (${variant})` : ''}</p>
        <p style="margin:0 0 6px;"><strong>SKU:</strong> ${skuLabel}</p>
        <p style="margin:0 0 6px;"><strong>Available:</strong> ${avail} <span style="color:#666">(on hand ${hand}, reserved ${res})</span></p>
        <p style="margin:0 0 12px;"><strong>Alert threshold:</strong> ${thresh}</p>
        <p style="margin:0;">Sign in to admin → <strong>Inventory</strong> to restock.</p>
      </div>
    `,
    })
    return true
  } catch (err) {
    console.error('Low stock alert email failed:', err.message)
    return false
  }
}

function orderEmailShell({ title, bodyHtml, bodyText }) {
  return {
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">${title}</h2>
        ${bodyHtml}
      </div>
    `,
    text: bodyText,
  }
}

async function sendOrderStatusEmail({ to, orderId, customerName, status, trackingNumber, courierPartner, trackingUrl }) {
  const { from } = mailConfig()
  if (!isMailConfigured() || !to) return false
  const transporter = makeTransporter()
  const safeName = String(customerName || 'Customer').trim() || 'Customer'
  const safeOrderId = String(orderId || '').trim()
  const s = String(status || '').trim()

  let subject = `Order update: ${safeOrderId}`
  let title = 'Order update'
  let detail = `Your order status is now: ${s}.`
  let extraHtml = ''
  let extraText = ''

  if (s === 'Confirmed') {
    subject = `Order confirmed: ${safeOrderId}`
    title = 'Your order is confirmed'
    detail = 'We have confirmed your order and will pack it soon.'
  } else if (s === 'Shipped' || s === 'Out For Delivery') {
    subject = `Order shipped: ${safeOrderId}`
    title = s === 'Out For Delivery' ? 'Your order is out for delivery' : 'Your order has shipped'
    detail = 'Your package is on the way.'
    if (trackingNumber || courierPartner) {
      const track = trackingUrl || (trackingNumber ? `Tracking: ${trackingNumber}` : '')
      extraHtml = `<p style="margin:8px 0 0;"><strong>Courier:</strong> ${courierPartner || '—'}<br/><strong>Tracking:</strong> ${trackingNumber || '—'}${trackingUrl ? `<br/><a href="${trackingUrl}">Track shipment</a>` : ''}</p>`
      extraText = `\nCourier: ${courierPartner || '—'}\nTracking: ${trackingNumber || '—'}${track ? `\n${track}` : ''}`
    }
  } else if (s === 'Delivered') {
    subject = `Order delivered: ${safeOrderId}`
    title = 'Your order was delivered'
    detail = 'Thank you for shopping with us. We hope you love your purchase!'
  } else if (s === 'Cancelled') {
    subject = `Order cancelled: ${safeOrderId}`
    title = 'Your order was cancelled'
    detail = 'Your order has been cancelled. If you were charged online, a refund will be processed shortly.'
  } else if (s === 'Return Requested') {
    subject = `Return requested: ${safeOrderId}`
    title = 'We received your return request'
    detail = 'Our team will review your return and share pickup or drop-off instructions.'
  } else if (s === 'Returned') {
    subject = `Return completed: ${safeOrderId}`
    title = 'Your return is complete'
    detail = 'We have received your returned items. Refunds are processed per our returns policy.'
  }

  const { html, text } = orderEmailShell({
    title,
    bodyHtml: `<p style="margin:0 0 8px;">Hi ${safeName},</p><p style="margin:0 0 8px;">${detail}</p><p style="margin:0 0 6px;"><strong>Order ID:</strong> ${safeOrderId}</p>${extraHtml}`,
    bodyText: `Hi ${safeName},\n\n${detail}\n\nOrder ID: ${safeOrderId}${extraText}`,
  })

  await transporter.sendMail({ from, to, subject, text, html })
  return true
}

async function sendOrderRefundEmail({ to, orderId, customerName, amount, note }) {
  const { from } = mailConfig()
  if (!isMailConfigured() || !to) return false
  const transporter = makeTransporter()
  const safeName = String(customerName || 'Customer').trim() || 'Customer'
  const safeOrderId = String(orderId || '').trim()
  const amt = Number(amount || 0).toLocaleString('en-IN')
  const { html, text } = orderEmailShell({
    title: 'Refund processed',
    bodyHtml: `<p style="margin:0 0 8px;">Hi ${safeName},</p><p style="margin:0 0 8px;">A refund of <strong>INR ${amt}</strong> has been initiated for order <strong>${safeOrderId}</strong>.</p>${note ? `<p style="margin:0;">Note: ${note}</p>` : ''}<p style="margin:12px 0 0;">Refunds typically appear in 5–7 business days depending on your bank.</p>`,
    bodyText: `Hi ${safeName},\n\nRefund of INR ${amt} initiated for order ${safeOrderId}.${note ? `\nNote: ${note}` : ''}\n\nRefunds typically appear in 5–7 business days.`,
  })
  await transporter.sendMail({
    from,
    to,
    subject: `Refund processed: ${safeOrderId}`,
    text,
    html,
  })
  return true
}

async function sendAdminReturnRequestEmail({ orderId, customerName, returnReason, rmaId }) {
  const to = adminNotifyEmail()
  if (!to || !isMailConfigured()) return false
  const { from } = mailConfig()
  const transporter = makeTransporter()
  await transporter.sendMail({
    from,
    to,
    subject: `Return requested: ${orderId}`,
    text: `Return request for ${orderId}\nCustomer: ${customerName}\nRMA: ${rmaId || '—'}\nReason: ${returnReason || '—'}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
        <h2 style="margin:0 0 12px;">Return request</h2>
        <p><strong>Order:</strong> ${orderId}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        ${rmaId ? `<p><strong>RMA:</strong> ${rmaId}</p>` : ''}
        <p><strong>Reason:</strong> ${returnReason || '—'}</p>
        <p>Open admin → Orders to process receive → restock → refund.</p>
      </div>
    `,
  })
  return true
}

module.exports = {
  isMailConfigured,
  sendPasswordResetOtpEmail,
  sendOrderConfirmationEmail,
  sendAdminNewOrderEmail,
  sendAdminLowStockEmail,
  sendOrderStatusEmail,
  sendOrderRefundEmail,
  sendAdminReturnRequestEmail,
}
