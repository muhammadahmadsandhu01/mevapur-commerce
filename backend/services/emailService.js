const nodemailer = require('nodemailer');

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Send email function
exports.sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM || 'MevaPur'}" <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Order confirmation email template
exports.sendOrderConfirmation = async (order, customer) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0F766E 0%, #115E59 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Order Confirmed! 🎉</h1>
      </div>
      <div style="padding: 30px; background: #f9f9f9;">
        <p style="font-size: 16px;">Dear ${customer.fullName},</p>
        <p style="font-size: 14px; color: #666;">Thank you for your order! We're excited to let you know that your order has been received and is being processed.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #0F766E;">Order Details</h3>
          <p><strong>Order ID:</strong> ${order.orderId}</p>
          <p><strong>Total Amount:</strong> Rs. ${order.totalAmount.toLocaleString()}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
          <p><strong>Status:</strong> ${order.orderStatus}</p>
        </div>

        <p style="font-size: 14px; color: #666;">You'll receive another email when your order is shipped.</p>
        <p style="font-size: 14px; color: #666;">Thank you for shopping with MevaPur!</p>
      </div>
      <div style="background: #0F766E; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
        <p style="color: white; margin: 0; font-size: 12px;">© 2026 MevaPur. All rights reserved.</p>
      </div>
    </div>
  `;

  return this.sendEmail({
    to: customer.email,
    subject: `Order Confirmation - ${order.orderId}`,
    html
  });
};

// Order status update email
exports.sendOrderStatusUpdate = async (order, customer) => {
  const statusMessages = {
    'Processing': 'Your order is now being processed',
    'Shipped': 'Your order has been shipped!',
    'Delivered': 'Your order has been delivered!',
    'Cancelled': 'Your order has been cancelled'
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Order Update </h1>
      </div>
      <div style="padding: 30px; background: #f9f9f9;">
        <p style="font-size: 16px;">Dear ${customer.fullName},</p>
        <p style="font-size: 14px; color: #666;">${statusMessages[order.orderStatus] || 'Your order status has been updated'}.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Order ID:</strong> ${order.orderId}</p>
          <p><strong>New Status:</strong> <span style="color: #0F766E; font-weight: bold;">${order.orderStatus}</span></p>
        </div>

        <p style="font-size: 14px; color: #666;">Thank you for shopping with MevaPur!</p>
      </div>
    </div>
  `;

  return this.sendEmail({
    to: customer.email,
    subject: `Order Status Update - ${order.orderId}`,
    html
  });
};

// Low stock alert email (to admin)
exports.sendLowStockAlert = async (product, adminEmail) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Low Stock Alert ⚠️</h1>
      </div>
      <div style="padding: 30px; background: #f9f9f9;">
        <p style="font-size: 16px;">Attention Admin,</p>
        <p style="font-size: 14px; color: #666;">The following product is running low on stock:</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p><strong>Product:</strong> ${product.name}</p>
          <p><strong>Current Stock:</strong> <span style="color: #EF4444; font-weight: bold;">${product.stock} units</span></p>
          <p><strong>SKU:</strong> ${product.sku}</p>
        </div>

        <p style="font-size: 14px; color: #666;">Please restock this product as soon as possible.</p>
      </div>
    </div>
  `;

  return this.sendEmail({
    to: adminEmail,
    subject: `Low Stock Alert: ${product.name}`,
    html
  });
};