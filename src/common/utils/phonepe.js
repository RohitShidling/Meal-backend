const { StandardCheckoutClient, Env, StandardCheckoutPayRequest } = require('@phonepe-pg/pg-sdk-node');

class PhonePeUtil {
  constructor() {
    this.clientId = process.env.PHONEPE_CLIENT_ID;
    this.clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    this.clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION) || 1;
    this.env = process.env.PHONEPE_ENV === 'live' ? Env.PRODUCTION : Env.SANDBOX;

    this.client = null;
    this.initClient();
  }

  initClient() {
    try {
      this.client = StandardCheckoutClient.getInstance(
        this.clientId,
        this.clientSecret,
        this.clientVersion,
        this.env
      );
      return true;
    } catch (error) {
      this.client = null;
      console.error('PhonePe SDK Initialization Error:', error.message);
      return false;
    }
  }

  ensureClient() {
    if (this.client) return true;
    return this.initClient();
  }

  /**
   * Industrial V2 Payment Initiation via official SDK
   */
  async initiatePayment(data) {
    try {
      if (!this.ensureClient()) {
        throw new Error('PhonePe client not initialized');
      }
      // Build the standard request object as per industry standards
      const request = StandardCheckoutPayRequest.builder()
        .merchantOrderId(data.transactionId)
        .amount(Math.round(data.amount * 100)) // Amount in paise
        .redirectUrl(data.redirectUrl)
        .build();

      const response = await this.client.pay(request);
      
      // The SDK returns success: true and the redirectUrl if everything is correct
      return {
        success: true,
        data: {
          instrumentResponse: {
            redirectInfo: {
              url: response.redirectUrl
            }
          }
        }
      };
    } catch (error) {
      // Log detailed error for debugging industrial connectivity
      console.error('PhonePe V2 SDK Pay Error:', error);
      return {
        success: false,
        message: error.message || 'Payment initiation failed'
      };
    }
  }

  /**
   * Industrial V2 Status Check via official SDK
   */
  async checkStatus(merchantTransactionId) {
    try {
      if (!this.ensureClient()) {
        throw new Error('PhonePe client not initialized');
      }
      const response = await this.client.getOrderStatus(merchantTransactionId);
      return {
        success: true,
        data: response
      };
    } catch (error) {
      console.error('PhonePe V2 SDK Status Error:', error);
      return {
        success: false,
        message: error.message || 'Status check failed'
      };
    }
  }

  /**
   * Callback validation logic for V2 webhooks (requires webhook credentials)
   */
  validateCallback(username, password, xVerifyHeader, bodyString) {
    try {
      if (!this.ensureClient()) {
        throw new Error('PhonePe client not initialized');
      }
      return this.client.validateCallback(username, password, xVerifyHeader, bodyString);
    } catch (error) {
      console.error('PhonePe Callback Validation Error:', error.message);
      throw error;
    }
  }
}

module.exports = new PhonePeUtil();
