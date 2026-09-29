/**
 * @file schemaIndexesAndBounds.test.js
 * @description Validates compound indexes and query boundedness across Order, Product, Refund, User, Payment schemas.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Refund = require('../../../models/Refund');
const User = require('../../../models/User');
const Payment = require('../../../models/Payment');

describe('Database Indexes & Query Performance Forensic Audit Verification', () => {
  describe('Order Model Indexes', () => {
    const indexes = Order.schema.indexes();

    it('has root sorting compound index { createdAt: -1, _id: -1 } to avoid COLLSCAN', () => {
      const match = indexes.find(([fields]) => fields.createdAt === -1 && fields._id === -1);
      expect(match).toBeDefined();
    });

    it('has customer order status compound index { user: 1, orderStatus: 1, createdAt: -1, _id: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.user === 1 && fields.orderStatus === 1 && fields.createdAt === -1 && fields._id === -1
      );
      expect(match).toBeDefined();
    });

    it('has financial aggregation compound index { paymentStatus: 1, orderStatus: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.paymentStatus === 1 && fields.orderStatus === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });

    it('has multi-tenant scope compound index { quote.merchantScopeId: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields['quote.merchantScopeId'] === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });
  });

  describe('Product Model Indexes', () => {
    const indexes = Product.schema.indexes();

    it('has category catalog price sort compound index { category: 1, status: 1, isActive: 1, price: 1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.category === 1 && fields.status === 1 && fields.isActive === 1 && fields.price === 1
      );
      expect(match).toBeDefined();
    });

    it('has brand catalog compound index { brand: 1, status: 1, isActive: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.brand === 1 && fields.status === 1 && fields.isActive === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });

    it('has subcategory catalog compound index { subcategory: 1, status: 1, isActive: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.subcategory === 1 && fields.status === 1 && fields.isActive === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });

    it('has popularity sort compound index { status: 1, isActive: 1, soldCount: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.status === 1 && fields.isActive === 1 && fields.soldCount === -1
      );
      expect(match).toBeDefined();
    });
  });

  describe('Refund Model Indexes', () => {
    const indexes = Refund.schema.indexes();

    it('has lookup pipeline compound index { order: 1, status: 1 }', () => {
      const match = indexes.find(([fields]) => fields.order === 1 && fields.status === 1);
      expect(match).toBeDefined();
    });
  });

  describe('User Model Indexes', () => {
    const indexes = User.schema.indexes();

    it('has customer management compound index { role: 1, isDeleted: 1, isBlocked: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.role === 1 && fields.isDeleted === 1 && fields.isBlocked === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });
  });

  describe('Payment Model Indexes', () => {
    const indexes = Payment.schema.indexes();

    it('has multi-tenant query compound index { merchantScopeId: 1, status: 1, createdAt: -1 }', () => {
      const match = indexes.find(
        ([fields]) => fields.merchantScopeId === 1 && fields.status === 1 && fields.createdAt === -1
      );
      expect(match).toBeDefined();
    });
  });
});
