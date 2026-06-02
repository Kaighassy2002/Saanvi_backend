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

module.exports = {
  isMailConfigured,
  sendPasswordResetOtpEmail,
  sendOrderConfirmationEmail,
}
