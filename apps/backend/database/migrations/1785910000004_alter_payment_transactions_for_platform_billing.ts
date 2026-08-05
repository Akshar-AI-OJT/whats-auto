import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payment_transactions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('gatewayOrderId').nullable()
      table.text('gatewayPaymentId').nullable()
      table.text('gatewayInvoiceId').nullable()
      table.text('paymentMethod').nullable()
      table.text('receiptNumber').nullable()
      table.text('failureCode').nullable()
      table.text('failureReason').nullable()
      table.decimal('refundedAmount', 18, 2).notNullable().defaultTo(0)
      table.timestamp('paidAt', { useTz: true }).nullable()
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      UPDATE "payment_transactions"
      SET "gatewayPaymentId" = "gatewayTransactionId"
      WHERE "gatewayPaymentId" IS NULL
        AND "gatewayTransactionId" IS NOT NULL
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        DROP CONSTRAINT IF EXISTS "payment_transactions_gateway_transaction_unique"
    `)
    this.schema.raw(`
      DROP INDEX IF EXISTS "payment_transactions_gateway_transaction_unique"
    `)

    // Lucid/Knex may name the FK differently; drop by column dependency.
    this.schema.raw(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'payment_transactions'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'subscriptionId'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "payment_transactions" DROP CONSTRAINT %I',
            fk_name
          );
        END IF;
      END $$;
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ALTER COLUMN "subscriptionId" DROP NOT NULL
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ADD CONSTRAINT "payment_transactions_subscription_id_fkey"
        FOREIGN KEY ("subscriptionId")
        REFERENCES "organization_subscriptions" ("id")
        ON DELETE SET NULL
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('gatewayTransactionId')
    })

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ADD CONSTRAINT "payment_transactions_refunded_amount_non_negative"
        CHECK ("refundedAmount" >= 0)
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "payment_transactions_gateway_payment_id_unique"
        ON "payment_transactions" ("gateway", "gatewayPaymentId")
        WHERE "gatewayPaymentId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "payment_transactions_gateway_order_id_unique"
        ON "payment_transactions" ("gateway", "gatewayOrderId")
        WHERE "gatewayOrderId" IS NOT NULL
    `)

    this.schema.raw(`
      CREATE INDEX "payment_transactions_subscription_id"
        ON "payment_transactions" ("subscriptionId")
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "payment_transactions"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "payment_transactions"`)
    this.schema.raw(`DROP INDEX IF EXISTS "payment_transactions_subscription_id"`)
    this.schema.raw(`DROP INDEX IF EXISTS "payment_transactions_gateway_order_id_unique"`)
    this.schema.raw(`DROP INDEX IF EXISTS "payment_transactions_gateway_payment_id_unique"`)
    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        DROP CONSTRAINT IF EXISTS "payment_transactions_refunded_amount_non_negative"
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.text('gatewayTransactionId').nullable()
    })

    this.schema.raw(`
      UPDATE "payment_transactions"
      SET "gatewayTransactionId" = "gatewayPaymentId"
      WHERE "gatewayTransactionId" IS NULL
        AND "gatewayPaymentId" IS NOT NULL
    `)

    // Restore NOT NULL only when every row has a value (dev/demo expectation).
    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ALTER COLUMN "gatewayTransactionId" SET NOT NULL
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "payment_transactions_gateway_transaction_unique"
        ON "payment_transactions" ("gateway", "gatewayTransactionId")
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        DROP CONSTRAINT IF EXISTS "payment_transactions_subscription_id_fkey"
    `)

    this.schema.raw(`
      UPDATE "payment_transactions"
      SET "subscriptionId" = (
        SELECT s."id"
        FROM "organization_subscriptions" s
        WHERE s."organizationId" = "payment_transactions"."organizationId"
        ORDER BY s."createdAt" DESC
        LIMIT 1
      )
      WHERE "subscriptionId" IS NULL
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ALTER COLUMN "subscriptionId" SET NOT NULL
    `)

    this.schema.raw(`
      ALTER TABLE "payment_transactions"
        ADD CONSTRAINT "payment_transactions_subscription_id_fkey"
        FOREIGN KEY ("subscriptionId")
        REFERENCES "organization_subscriptions" ("id")
        ON DELETE RESTRICT
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('updatedAt')
      table.dropColumn('paidAt')
      table.dropColumn('refundedAmount')
      table.dropColumn('failureReason')
      table.dropColumn('failureCode')
      table.dropColumn('receiptNumber')
      table.dropColumn('paymentMethod')
      table.dropColumn('gatewayInvoiceId')
      table.dropColumn('gatewayPaymentId')
      table.dropColumn('gatewayOrderId')
    })
  }
}
