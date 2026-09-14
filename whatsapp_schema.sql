--
-- PostgreSQL database dump
--

\restrict 1xjcz8gVsKscw1k5bBaRXwV81QJhnslmV8X9yFi8lqY3GywvpugrIOooK8l1jAT

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: block_session_for_inactive_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_session_for_inactive_user() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
            v_active BOOLEAN;
            v_deleted BOOLEAN;
        BEGIN
            SELECT "isActive", "isDeleted"
            INTO v_active, v_deleted
            FROM "users"
            WHERE "id" = NEW."userId";
  
            IF v_deleted THEN
                RAISE EXCEPTION
                    'Cannot create session for deleted user (%)',
                    NEW."userId";
            END IF;
  
            IF NOT v_active THEN
                RAISE EXCEPTION
                    'Cannot create session for inactive user (%)',
                    NEW."userId";
            END IF;
  
            RETURN NEW;
        END;
        $$;


--
-- Name: count_ai_knowledge_chunks_in_space(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_ai_knowledge_chunks_in_space(p_space_id text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT COUNT(*)::bigint
        FROM ai_knowledge_chunks
        WHERE "embeddingSpaceId" = p_space_id
      $$;


--
-- Name: delete_ai_knowledge_chunks_in_space(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_ai_knowledge_chunks_in_space(p_space_id text) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        WITH deleted AS (
          DELETE FROM ai_knowledge_chunks
          WHERE "embeddingSpaceId" = p_space_id
          RETURNING 1
        )
        SELECT COUNT(*)::bigint FROM deleted
      $$;


--
-- Name: ensure_one_owner_per_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_one_owner_per_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF NEW."organizationId" IS NULL THEN
          RETURN NEW;
        END IF;

        IF EXISTS (
          SELECT 1 FROM "roles" r
          WHERE r."id" = NEW."roleId" AND r."name" = 'owner'
        ) AND EXISTS (
          SELECT 1
          FROM "user_roles" ur
          JOIN "roles" r2 ON r2."id" = ur."roleId"
          WHERE ur."organizationId" = NEW."organizationId"
            AND r2."name" = 'owner'
            AND ur."id" IS DISTINCT FROM NEW."id"
        ) THEN
          RAISE EXCEPTION
            'Organization already has an owner (organizationId=%)',
            NEW."organizationId";
        END IF;

        RETURN NEW;
      END;
      $$;


--
-- Name: handle_user_deactivation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_deactivation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          IF (NEW."isActive" = FALSE OR NEW."isDeleted" = TRUE)
             AND (
                  OLD."isActive" IS DISTINCT FROM NEW."isActive"
                  OR
                  OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
             ) THEN

              DELETE FROM "sessions"
              WHERE "userId" = NEW."id";

          END IF;

          IF NEW."isDeleted" = TRUE
             AND OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
          THEN
              DELETE FROM "accounts"
              WHERE "userId" = NEW."id";
          END IF;

          RETURN NEW;
      END;
      $$;


--
-- Name: list_ai_knowledge_documents_for_reindex(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ai_knowledge_documents_for_reindex() RETURNS TABLE("organizationId" uuid, id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
          AND d."deletedAt" IS NULL
      $$;


--
-- Name: list_ai_knowledge_documents_missing_space(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ai_knowledge_documents_missing_space(p_space_id text) RETURNS TABLE("organizationId" uuid, id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
          AND d."deletedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ai_knowledge_chunks c
            WHERE c."documentId" = d.id
              AND c."embeddingSpaceId" = p_space_id
          )
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: integration_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "connectionId" uuid,
    provider text NOT NULL,
    "externalEventId" text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    "errorCode" text,
    "receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "processedAt" timestamp with time zone,
    CONSTRAINT integration_events_provider_check CHECK ((provider = ANY (ARRAY['shopenup'::text, 'custom'::text]))),
    CONSTRAINT integration_events_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'processed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.integration_events FORCE ROW LEVEL SECURITY;


--
-- Name: list_stale_accepted_integration_events(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_stale_accepted_integration_events(p_older_than timestamp with time zone, p_limit integer) RETURNS SETOF public.integration_events
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT *
        FROM integration_events
        WHERE status = 'accepted'
          AND "receivedAt" < p_older_than
        ORDER BY "receivedAt" ASC
        LIMIT p_limit
      $$;


--
-- Name: reject_custom_role_org_overrides(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_custom_role_org_overrides() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE
        role_org_id uuid;
      BEGIN
        SELECT r."organizationId" INTO role_org_id FROM "roles" r WHERE r."id" = NEW."roleId";
        IF role_org_id IS NOT NULL THEN
          RAISE EXCEPTION
            'organization_role_permissions only applies to global roles, not org-scoped custom roles (roleId=%)',
            NEW."roleId";
        END IF;
        RETURN NEW;
      END;
      $$;


--
-- Name: reject_immutable_role_permission_overrides(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_immutable_role_permission_overrides() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE
        role_name text;
      BEGIN
        SELECT r."name" INTO role_name
        FROM "roles" r
        WHERE r."id" = NEW."roleId";

        IF role_name IN ('owner', 'superadmin') THEN
          RAISE EXCEPTION
            'Cannot override permissions for immutable role "%" (roleId=%)',
            role_name, NEW."roleId";
        END IF;

        RETURN NEW;
      END;
      $$;


--
-- Name: resolve_api_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_api_key(p_key_hash text) RETURNS TABLE(id uuid, "organizationId" uuid, scopes text[], "revokedAt" timestamp with time zone, "expiresAt" timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT k.id, k."organizationId", k.scopes, k."revokedAt", k."expiresAt"
        FROM api_keys k
        INNER JOIN organizations o ON o.id = k."organizationId"
        WHERE k."keyHash" = p_key_hash
          AND o."deletedAt" IS NULL
        LIMIT 1
      $$;


--
-- Name: resolve_connected_whatsapp_config(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_connected_whatsapp_config(p_phone_number_id text) RETURNS TABLE(id uuid, "organizationId" uuid, "phoneNumberId" text, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
        SELECT wc.id, wc."organizationId", wc."phoneNumberId", wc.status
        FROM whatsapp_configs wc
        INNER JOIN organizations o ON o.id = wc."organizationId"
        WHERE wc."phoneNumberId" = p_phone_number_id
          AND wc.status = 'connected'
          AND o."deletedAt" IS NULL
        LIMIT 1
      $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW."updatedAt" = now();
        RETURN NEW;
      END;
      $$;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    password text,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone
);


--
-- Name: adonis_schema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adonis_schema (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    batch integer NOT NULL,
    migration_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: adonis_schema_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adonis_schema_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adonis_schema_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adonis_schema_id_seq OWNED BY public.adonis_schema.id;


--
-- Name: adonis_schema_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adonis_schema_versions (
    version integer NOT NULL
);


--
-- Name: ai_knowledge_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "documentId" uuid NOT NULL,
    "chunkIndex" integer NOT NULL,
    "contentHash" character varying(64) NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    embedding public.vector(1024) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "embeddingSpaceId" character varying(160) DEFAULT 'openai:text-embedding-3-small:1024:v1'::character varying NOT NULL
);

ALTER TABLE ONLY public.ai_knowledge_chunks FORCE ROW LEVEL SECURITY;


--
-- Name: ai_knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "mediaAssetId" uuid,
    title character varying(255) NOT NULL,
    "sourceType" character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    "chunkCount" integer DEFAULT 0 NOT NULL,
    "embeddingModel" character varying(100) DEFAULT 'text-embedding-3-small'::character varying NOT NULL,
    "documentHash" character varying(64),
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone,
    CONSTRAINT ai_knowledge_documents_source_type_check CHECK ((("sourceType")::text = ANY (ARRAY[('FILE_PDF'::character varying)::text, ('FILE_DOCX'::character varying)::text, ('FILE_TXT'::character varying)::text]))),
    CONSTRAINT ai_knowledge_documents_status_check CHECK (((status)::text = ANY (ARRAY[('PENDING'::character varying)::text, ('PROCESSING'::character varying)::text, ('INDEXED'::character varying)::text, ('FAILED'::character varying)::text])))
);

ALTER TABLE ONLY public.ai_knowledge_documents FORCE ROW LEVEL SECURITY;


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "messageId" uuid,
    "promptTokens" integer DEFAULT 0 NOT NULL,
    "completionTokens" integer DEFAULT 0 NOT NULL,
    "totalTokens" integer DEFAULT 0 NOT NULL,
    "estimatedCostUsd" numeric(10,6) DEFAULT 0 NOT NULL,
    "modelName" character varying(100) NOT NULL,
    "latencyMs" integer NOT NULL,
    decision character varying(50) NOT NULL,
    "retrievalScore" numeric(3,2),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_logs_decision_check CHECK (((decision)::text = ANY (ARRAY[('AUTO_REPLIED'::character varying)::text, ('HANDOVER_LOW_CONFIDENCE'::character varying)::text, ('HANDOVER_KEYWORD'::character varying)::text, ('HANDOVER_ERROR'::character varying)::text])))
);

ALTER TABLE ONLY public.ai_usage_logs FORCE ROW LEVEL SECURITY;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "createdByUserId" uuid,
    name text NOT NULL,
    "keyPrefix" text NOT NULL,
    "keyHash" text NOT NULL,
    scopes text[] DEFAULT ARRAY['events:write'::text] NOT NULL,
    "lastUsedAt" timestamp with time zone,
    "expiresAt" timestamp with time zone,
    "revokedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);

ALTER TABLE ONLY public.api_keys FORCE ROW LEVEL SECURITY;


--
-- Name: authorization_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid,
    "roleId" uuid,
    "permissionId" uuid,
    "actorUserId" uuid,
    "targetType" text NOT NULL,
    "targetId" uuid,
    "eventType" text NOT NULL,
    granted boolean,
    before jsonb,
    after jsonb,
    reason text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "planId" uuid NOT NULL,
    "subscriptionId" uuid,
    gateway text DEFAULT 'razorpay'::text NOT NULL,
    "gatewayOrderId" text NOT NULL,
    purpose text NOT NULL,
    status text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "taxRate" numeric(8,6) DEFAULT '0'::numeric NOT NULL,
    tax numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(18,2) NOT NULL,
    currency character varying(20) NOT NULL,
    "periodStart" timestamp with time zone NOT NULL,
    "periodEnd" timestamp with time zone NOT NULL,
    "planSnapshot" jsonb NOT NULL,
    "paymentTransactionId" uuid,
    "invoiceId" uuid,
    receipt text,
    "appliedAt" timestamp with time zone,
    "expiresAt" timestamp with time zone,
    "failureReason" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT billing_orders_amount_non_negative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT billing_orders_period_valid CHECK (("periodEnd" > "periodStart")),
    CONSTRAINT billing_orders_purpose_valid CHECK ((purpose = ANY (ARRAY['new_subscription'::text, 'renewal'::text, 'plan_change'::text]))),
    CONSTRAINT billing_orders_status_valid CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]))),
    CONSTRAINT billing_orders_tax_non_negative CHECK ((tax >= (0)::numeric)),
    CONSTRAINT billing_orders_tax_rate_valid CHECK ((("taxRate" >= (0)::numeric) AND ("taxRate" <= (1)::numeric))),
    CONSTRAINT billing_orders_total_non_negative CHECK ((total >= (0)::numeric))
);

ALTER TABLE ONLY public.billing_orders FORCE ROW LEVEL SECURITY;


--
-- Name: broadcast_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "broadcastId" uuid NOT NULL,
    "contactId" uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    variables jsonb,
    "messageId" uuid,
    "errorMessage" text,
    "sentAt" timestamp with time zone,
    "deliveredAt" timestamp with time zone,
    "readAt" timestamp with time zone,
    "repliedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.broadcast_recipients FORCE ROW LEVEL SECURITY;


--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "createdByUserId" uuid,
    name text NOT NULL,
    "whatsappConfigId" uuid,
    "messageTemplateId" uuid,
    "scheduledAt" timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    "totalRecipients" integer DEFAULT 0 NOT NULL,
    "sentCount" integer DEFAULT 0 NOT NULL,
    "deliveredCount" integer DEFAULT 0 NOT NULL,
    "readCount" integer DEFAULT 0 NOT NULL,
    "repliedCount" integer DEFAULT 0 NOT NULL,
    "failedCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "headerMediaAssetId" uuid,
    "finalizedAt" timestamp with time zone,
    "cancelledAt" timestamp with time zone,
    "variableMappings" jsonb,
    "audienceTagId" uuid
);

ALTER TABLE ONLY public.broadcasts FORCE ROW LEVEL SECURITY;


--
-- Name: contact_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "contactId" uuid NOT NULL,
    "eventType" text NOT NULL,
    source text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.contact_consent_events FORCE ROW LEVEL SECURITY;


--
-- Name: contact_import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "importId" uuid NOT NULL,
    "contactId" uuid,
    "rowNumber" integer NOT NULL,
    "rawData" jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    action text,
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.contact_import_rows FORCE ROW LEVEL SECURITY;


--
-- Name: contact_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "createdByUserId" uuid,
    "fileName" text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "columnMapping" jsonb,
    "processedRows" integer DEFAULT 0 NOT NULL,
    "totalRows" integer DEFAULT 0 NOT NULL,
    "successCount" integer DEFAULT 0 NOT NULL,
    "errorCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "defaultCountryCode" character varying(2)
);

ALTER TABLE ONLY public.contact_imports FORCE ROW LEVEL SECURITY;


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "contactId" uuid NOT NULL,
    "tagId" uuid NOT NULL
);

ALTER TABLE ONLY public.contact_tags FORCE ROW LEVEL SECURITY;


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    phone character varying(100) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "phoneNormalized" text NOT NULL,
    name character varying(255),
    email character varying(255),
    company character varying(255),
    "customFields" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdByUserId" uuid,
    "deletedAt" timestamp with time zone,
    "marketingOptIn" boolean DEFAULT false NOT NULL,
    "optedOutAt" timestamp with time zone
);

ALTER TABLE ONLY public.contacts FORCE ROW LEVEL SECURITY;


--
-- Name: conversation_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "agentUserId" uuid,
    "assignedByUserId" uuid,
    reason text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.conversation_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: conversation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "authorUserId" uuid NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);

ALTER TABLE ONLY public.conversation_notes FORCE ROW LEVEL SECURITY;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "whatsappConfigId" uuid NOT NULL,
    "contactId" uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    "assignedAgentId" uuid,
    "lastMessageText" text,
    "lastMessageAt" timestamp with time zone,
    "firstResponseAt" timestamp with time zone,
    "closedAt" timestamp with time zone,
    "unreadCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "aiMode" text DEFAULT 'AI_AUTO'::text NOT NULL,
    "aiSummary" text,
    "attributedCampaignId" uuid,
    "aiHandoverReason" text,
    CONSTRAINT conversations_ai_mode_check CHECK (("aiMode" = ANY (ARRAY['AI_AUTO'::text, 'HANDOVER'::text, 'HUMAN_ACTIVE'::text])))
);

ALTER TABLE ONLY public.conversations FORCE ROW LEVEL SECURITY;


--
-- Name: flow_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_execution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "flowSessionId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "nodeId" character varying(100) NOT NULL,
    "nodeType" character varying(50) NOT NULL,
    "actionTaken" character varying(100) NOT NULL,
    "inputPayload" jsonb,
    "outputPayload" jsonb,
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flow_execution_logs FORCE ROW LEVEL SECURITY;


--
-- Name: flow_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "contactId" uuid NOT NULL,
    "flowId" uuid NOT NULL,
    "flowVersionId" uuid NOT NULL,
    "currentNodeId" character varying(100) NOT NULL,
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    "callStack" jsonb DEFAULT '[]'::jsonb NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    "lastInteractionAt" timestamp with time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT flow_sessions_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('WAITING_FOR_INPUT'::character varying)::text, ('PAUSED_FOR_AI'::character varying)::text, ('PAUSED_FOR_HUMAN'::character varying)::text, ('COMPLETED'::character varying)::text, ('TERMINATED'::character varying)::text])))
);

ALTER TABLE ONLY public.flow_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: flow_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "flowId" uuid NOT NULL,
    "versionNumber" integer DEFAULT 1 NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    edges jsonb DEFAULT '[]'::jsonb NOT NULL,
    viewport jsonb DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb,
    "validationStatus" character varying(50) DEFAULT 'VALID'::character varying NOT NULL,
    "validationErrors" jsonb DEFAULT '[]'::jsonb,
    "createdByUserId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.flow_versions FORCE ROW LEVEL SECURITY;


--
-- Name: flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'DRAFT'::character varying NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "publishedVersionId" uuid,
    "triggerType" character varying(50) DEFAULT 'KEYWORD'::character varying NOT NULL,
    "triggerConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdByUserId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT flows_status_check CHECK (((status)::text = ANY (ARRAY[('DRAFT'::character varying)::text, ('PUBLISHED'::character varying)::text, ('ARCHIVED'::character varying)::text])))
);

ALTER TABLE ONLY public.flows FORCE ROW LEVEL SECURITY;


--
-- Name: integration_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    provider text NOT NULL,
    "externalAccountId" text,
    "displayName" text NOT NULL,
    "encryptedSecret" text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    "lastSyncAt" timestamp with time zone,
    "lastErrorCode" text,
    "lastErrorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT integration_connections_provider_check CHECK ((provider = ANY (ARRAY['shopenup'::text, 'custom'::text]))),
    CONSTRAINT integration_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text])))
);

ALTER TABLE ONLY public.integration_connections FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "invoiceId" uuid NOT NULL,
    "organizationId" uuid NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    description text NOT NULL,
    detail text,
    quantity numeric(18,4) DEFAULT '1'::numeric NOT NULL,
    "unitPrice" numeric(18,2) NOT NULL,
    amount numeric(18,2) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_line_items_amount_non_negative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT invoice_line_items_quantity_positive CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.invoice_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "subscriptionId" uuid,
    "planId" uuid,
    "paymentTransactionId" uuid,
    "sourceInvoiceId" uuid,
    "invoiceNumber" text NOT NULL,
    status text NOT NULL,
    "billingPeriod" text NOT NULL,
    "planName" text NOT NULL,
    "periodStart" timestamp with time zone NOT NULL,
    "periodEnd" timestamp with time zone NOT NULL,
    "issueDate" date NOT NULL,
    "dueDate" date NOT NULL,
    currency character varying(20) NOT NULL,
    subtotal numeric(18,2) NOT NULL,
    "taxRate" numeric(8,6) DEFAULT '0'::numeric NOT NULL,
    tax numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    discount numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(18,2) NOT NULL,
    notes text,
    "paymentMethod" text,
    "billToName" text NOT NULL,
    "billToEmail" text NOT NULL,
    "billToPhone" text,
    "billToAddress" text,
    "billToGstin" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "paidAt" timestamp with time zone,
    "cancelledAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT invoices_discount_non_negative CHECK ((discount >= (0)::numeric)),
    CONSTRAINT invoices_due_on_or_after_issue CHECK (("dueDate" >= "issueDate")),
    CONSTRAINT invoices_period_valid CHECK (("periodEnd" > "periodStart")),
    CONSTRAINT invoices_subtotal_non_negative CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT invoices_tax_non_negative CHECK ((tax >= (0)::numeric)),
    CONSTRAINT invoices_tax_rate_valid CHECK ((("taxRate" >= (0)::numeric) AND ("taxRate" <= (1)::numeric))),
    CONSTRAINT invoices_total_non_negative CHECK ((total >= (0)::numeric))
);

ALTER TABLE ONLY public.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: jwks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jwks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    alg text,
    crv text,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_asset_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_asset_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "mediaAssetId" uuid NOT NULL,
    "ownerType" character varying(64) NOT NULL,
    "ownerId" uuid NOT NULL,
    "protectedUntil" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_asset_references_owner_type_check CHECK ((("ownerType")::text = ANY (ARRAY[('message'::character varying)::text, ('draft'::character varying)::text, ('scheduled_message'::character varying)::text, ('campaign'::character varying)::text, ('template'::character varying)::text])))
);

ALTER TABLE ONLY public.media_asset_references FORCE ROW LEVEL SECURITY;


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" text NOT NULL,
    "mimeType" character varying(255) NOT NULL,
    "fileSize" bigint NOT NULL,
    "uploadedBy" uuid,
    "uploadedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "storageDisk" character varying(32) DEFAULT 's3'::character varying NOT NULL,
    "storageKey" text NOT NULL,
    "deliveryUrl" text NOT NULL,
    state text DEFAULT 'ready'::text NOT NULL,
    source text DEFAULT 'upload'::text NOT NULL,
    checksum character varying(128),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "storageObjectId" uuid,
    CONSTRAINT media_assets_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'inbound'::text, 'system'::text]))),
    CONSTRAINT media_assets_state_check CHECK ((state = ANY (ARRAY['pending_upload'::text, 'ready'::text, 'failed'::text, 'deleted'::text])))
);

ALTER TABLE ONLY public.media_assets FORCE ROW LEVEL SECURITY;


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "whatsappConfigId" uuid,
    "createdByUserId" uuid,
    name text NOT NULL,
    category text NOT NULL,
    language text,
    "headerType" text,
    "headerContent" text,
    "headerMediaUrl" text,
    "bodyText" text NOT NULL,
    "footerText" text,
    buttons jsonb,
    "sampleValues" jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    "metaTemplateId" text,
    "rejectionReason" text,
    "qualityScore" text,
    "submissionError" text,
    "lastSubmittedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "parameterSchema" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.message_templates FORCE ROW LEVEL SECURITY;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "senderType" text NOT NULL,
    "senderId" uuid,
    "contentType" text NOT NULL,
    "contentText" text,
    "mediaUrl" text,
    "mediaAssetId" uuid,
    "messageTemplateId" uuid,
    "providerMessageId" text,
    status text DEFAULT 'queued'::text NOT NULL,
    "replyToMessageId" uuid,
    "interactiveReplyId" text,
    "interactivePayload" jsonb,
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "occurredAt" timestamp with time zone DEFAULT now() NOT NULL,
    "providerStatusAt" timestamp with time zone,
    "sentAt" timestamp with time zone,
    "deliveredAt" timestamp with time zone,
    "readAt" timestamp with time zone,
    "failedAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "clientIdempotencyKey" text
);

ALTER TABLE ONLY public.messages FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    type text NOT NULL,
    "conversationId" uuid,
    "contactId" uuid,
    "actorUserId" uuid,
    title text NOT NULL,
    body text,
    "readAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "inviterId" uuid NOT NULL,
    email character varying(255) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    CONSTRAINT organization_invitations_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'canceled'::text])))
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "permissionVersion" integer DEFAULT 1 NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp with time zone,
    designation character varying(120),
    CONSTRAINT chk_org_members_deleted CHECK (((("isDeleted" = false) AND ("deletedAt" IS NULL)) OR (("isDeleted" = true) AND ("deletedAt" IS NOT NULL)))),
    CONSTRAINT organization_members_permission_version_positive CHECK (("permissionVersion" > 0))
);


--
-- Name: organization_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "permissionId" uuid NOT NULL,
    granted boolean DEFAULT true NOT NULL
);


--
-- Name: organization_storage_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_storage_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "storageKey" text NOT NULL,
    "storageDisk" character varying(32) DEFAULT 's3'::character varying NOT NULL,
    namespace character varying(64) NOT NULL,
    "ownerType" character varying(64) NOT NULL,
    "ownerId" uuid,
    "mimeType" character varying(255) NOT NULL,
    "sizeBytes" bigint NOT NULL,
    checksum character varying(128),
    state character varying(32) DEFAULT 'pending_upload'::character varying NOT NULL,
    "retentionPolicy" character varying(64) NOT NULL,
    provenance character varying(64) DEFAULT 'upload'::character varying NOT NULL,
    "keyVersion" smallint DEFAULT '2'::smallint NOT NULL,
    "deletedAt" timestamp with time zone,
    "purgeAfter" timestamp with time zone,
    "purgedAt" timestamp with time zone,
    "deleteAttempts" integer DEFAULT 0 NOT NULL,
    "lastDeleteErrorAt" timestamp with time zone,
    "lastDeleteError" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_storage_objects_namespace_check CHECK (((namespace)::text = ANY (ARRAY[('media_library'::character varying)::text, ('campaigns'::character varying)::text, ('knowledge_base'::character varying)::text, ('ai'::character varying)::text, ('profile'::character varying)::text, ('imports'::character varying)::text, ('exports'::character varying)::text, ('temp'::character varying)::text]))),
    CONSTRAINT organization_storage_objects_retention_check CHECK ((("retentionPolicy")::text = ANY (ARRAY[('until_deleted'::character varying)::text, ('campaign_terminal_plus_30d'::character varying)::text, ('ai_30d'::character varying)::text, ('import_7d'::character varying)::text, ('export_7d'::character varying)::text, ('temp_24h'::character varying)::text]))),
    CONSTRAINT organization_storage_objects_state_check CHECK (((state)::text = ANY (ARRAY[('pending_upload'::character varying)::text, ('ready'::character varying)::text, ('failed'::character varying)::text, ('deleted'::character varying)::text, ('purged'::character varying)::text])))
);

ALTER TABLE ONLY public.organization_storage_objects FORCE ROW LEVEL SECURITY;


--
-- Name: organization_storage_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_storage_usages (
    "organizationId" uuid NOT NULL,
    "readyBytes" bigint DEFAULT '0'::bigint NOT NULL,
    "reservedBytes" bigint DEFAULT '0'::bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_storage_usages_ready_nonneg CHECK (("readyBytes" >= 0)),
    CONSTRAINT organization_storage_usages_reserved_nonneg CHECK (("reservedBytes" >= 0))
);

ALTER TABLE ONLY public.organization_storage_usages FORCE ROW LEVEL SECURITY;


--
-- Name: organization_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "planId" uuid NOT NULL,
    status text NOT NULL,
    "currentPeriodStart" timestamp with time zone NOT NULL,
    "currentPeriodEnd" timestamp with time zone NOT NULL,
    "cancelAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    gateway text,
    "gatewaySubscriptionId" text,
    "checkoutUrl" text,
    "trialEndsAt" timestamp with time zone,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "activatedAt" timestamp with time zone,
    "cancelledAt" timestamp with time zone,
    "endedAt" timestamp with time zone,
    "lastPaymentStatus" text,
    "lastPaymentAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "graceEndsAt" timestamp with time zone,
    CONSTRAINT organization_subscriptions_period_valid CHECK (("currentPeriodEnd" > "currentPeriodStart"))
);

ALTER TABLE ONLY public.organization_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(100),
    website character varying(255),
    industry character varying(100),
    country character varying(100) NOT NULL,
    timezone character varying(100) NOT NULL,
    currency character varying(10),
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone,
    gateway text,
    "gatewayCustomerId" text,
    "organizationType" character varying(32),
    address jsonb,
    pan character varying(10),
    gstin character varying(15),
    description text,
    "businessSize" character varying(64),
    "alternatePhone" character varying(100),
    "defaultLanguage" character varying(16),
    "businessRegistrationNumber" character varying(64),
    CONSTRAINT organizations_gstin_format_check CHECK (((gstin IS NULL) OR ((gstin)::text ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'::text))),
    CONSTRAINT organizations_organization_type_check CHECK ((("organizationType" IS NULL) OR (("organizationType")::text = ANY (ARRAY[('company'::character varying)::text, ('partnership'::character varying)::text, ('sole_proprietorship'::character varying)::text, ('other'::character varying)::text])))),
    CONSTRAINT organizations_pan_format_check CHECK (((pan IS NULL) OR ((pan)::text ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::text)))
);


--
-- Name: outbound_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "whatsappConfigId" uuid NOT NULL,
    "messageId" uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp with time zone,
    "lockOwner" text,
    "lockedAt" timestamp with time zone,
    "lockExpiresAt" timestamp with time zone,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    "errorMessage" text,
    "errorCode" text,
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT outbound_dispatches_attempts_non_negative CHECK ((attempts >= 0)),
    CONSTRAINT outbound_dispatches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'retry_scheduled'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.outbound_dispatches FORCE ROW LEVEL SECURITY;


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "subscriptionId" uuid,
    gateway text NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency character varying(20) NOT NULL,
    status text NOT NULL,
    "invoiceUrl" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "gatewayOrderId" text,
    "gatewayPaymentId" text,
    "gatewayInvoiceId" text,
    "paymentMethod" text,
    "receiptNumber" text,
    "failureCode" text,
    "failureReason" text,
    "refundedAmount" numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    "paidAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    CONSTRAINT payment_transactions_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_transactions_refunded_amount_non_negative CHECK (("refundedAmount" >= (0)::numeric))
);

ALTER TABLE ONLY public.payment_transactions FORCE ROW LEVEL SECURITY;


--
-- Name: payment_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    "eventId" text NOT NULL,
    "eventType" text NOT NULL,
    "organizationId" uuid,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "processingError" text,
    "processedAt" timestamp with time zone,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL,
    "lockedAt" timestamp with time zone,
    "lockExpiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_webhook_events_retry_count_non_negative CHECK (("retryCount" >= 0)),
    CONSTRAINT payment_webhook_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'ignored'::text, 'failed'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    module character varying(20) NOT NULL,
    action character varying(30) NOT NULL,
    description character varying(100),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price numeric(18,2) NOT NULL,
    currency character varying(20) NOT NULL,
    "billingInterval" text NOT NULL,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    code text NOT NULL,
    description text,
    "billingIntervalCount" integer DEFAULT 1 NOT NULL,
    "trialDays" integer DEFAULT 0 NOT NULL,
    gateway text,
    "gatewayPlanId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT plans_billing_interval_count_positive CHECK (("billingIntervalCount" >= 1)),
    CONSTRAINT plans_price_non_negative CHECK ((price >= (0)::numeric)),
    CONSTRAINT plans_trial_days_non_negative CHECK (("trialDays" >= 0))
);


--
-- Name: platform_ai_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_ai_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "singletonKey" text DEFAULT 'default'::text NOT NULL,
    "isEnabled" boolean DEFAULT true NOT NULL,
    "modelName" character varying(100) DEFAULT 'gpt-4o-mini'::character varying NOT NULL,
    temperature numeric(3,2) DEFAULT 0.20 NOT NULL,
    "campaignAttributionWindowHours" integer DEFAULT 48 NOT NULL,
    "minConfidenceScore" numeric(3,2) DEFAULT 0.70 NOT NULL,
    "debounceDelaySeconds" integer DEFAULT 4 NOT NULL,
    "systemPrompt" text,
    "workingSetSize" integer DEFAULT 6 NOT NULL,
    "summaryTurnThreshold" integer DEFAULT 10 NOT NULL,
    "embeddingModel" character varying(100) DEFAULT 'text-embedding-3-small'::character varying NOT NULL,
    "updatedByUserId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "chatProvider" character varying(20) DEFAULT 'openai'::character varying NOT NULL,
    "chatModel" character varying(100) DEFAULT 'gpt-4o-mini'::character varying NOT NULL,
    "summaryModel" character varying(100),
    "embeddingProvider" character varying(20) DEFAULT 'openai'::character varying NOT NULL,
    "activeEmbeddingSpaceId" character varying(160) DEFAULT 'openai:text-embedding-3-small:1024:v1'::character varying NOT NULL,
    "maxOutputTokens" integer DEFAULT 1024 NOT NULL,
    "reindexStatus" character varying(20) DEFAULT 'idle'::character varying NOT NULL,
    "reindexFromSpaceId" character varying(160),
    "reindexToSpaceId" character varying(160),
    "reindexEmbeddingModel" character varying(100),
    "reindexEmbeddingProvider" character varying(20),
    CONSTRAINT platform_ai_configs_chat_provider_check CHECK ((("chatProvider")::text = ANY (ARRAY[('openai'::character varying)::text, ('google'::character varying)::text, ('mistral'::character varying)::text]))),
    CONSTRAINT platform_ai_configs_embedding_provider_check CHECK ((("embeddingProvider")::text = ANY (ARRAY[('openai'::character varying)::text, ('google'::character varying)::text, ('mistral'::character varying)::text]))),
    CONSTRAINT platform_ai_configs_reindex_status_check CHECK ((("reindexStatus")::text = ANY (ARRAY[('idle'::character varying)::text, ('running'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT platform_ai_configs_singleton_key_default CHECK (("singletonKey" = 'default'::text))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    "roleId" uuid NOT NULL,
    "permissionId" uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(20) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "organizationId" uuid
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    token text NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    "activeOrganizationId" uuid
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "createdByUserId" uuid,
    name text NOT NULL,
    color text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT tags_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

ALTER TABLE ONLY public.tags FORCE ROW LEVEL SECURITY;


--
-- Name: unmatched_provider_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unmatched_provider_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "whatsappConfigId" uuid NOT NULL,
    "providerMessageId" text NOT NULL,
    status text NOT NULL,
    "providerStatusAt" timestamp with time zone NOT NULL,
    "errorMessage" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone,
    CONSTRAINT unmatched_provider_receipts_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.unmatched_provider_receipts FORCE ROW LEVEL SECURITY;


--
-- Name: usage_meters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_meters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    metric text NOT NULL,
    "periodStart" timestamp with time zone NOT NULL,
    "periodEnd" timestamp with time zone NOT NULL,
    "usedCount" integer DEFAULT 0 NOT NULL,
    "limitCount" integer NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_meters_limit_count_non_negative CHECK (("limitCount" >= 0)),
    CONSTRAINT usage_meters_period_valid CHECK (("periodEnd" > "periodStart")),
    CONSTRAINT usage_meters_used_count_non_negative CHECK (("usedCount" >= 0))
);

ALTER TABLE ONLY public.usage_meters FORCE ROW LEVEL SECURITY;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "organizationId" uuid,
    "permissionVersion" integer DEFAULT 1 NOT NULL,
    CONSTRAINT user_roles_permission_version_positive CHECK (("permissionVersion" > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    firstname text NOT NULL,
    lastname text NOT NULL,
    image text,
    email character varying(100) NOT NULL,
    "emailVerified" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "updatedBy" uuid,
    CONSTRAINT users_check CHECK (((("isDeleted" = false) AND ("deletedAt" IS NULL)) OR (("isDeleted" = true) AND ("deletedAt" IS NOT NULL) AND ("isActive" = false))))
);


--
-- Name: verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);


--
-- Name: whatsapp_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "phoneNumberId" text NOT NULL,
    "wabaId" text,
    "accessToken" text NOT NULL,
    "verifyToken" text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    "connectedAt" timestamp with time zone,
    "registeredAt" timestamp with time zone,
    "subscribedAppsAt" timestamp with time zone,
    "createdByUserId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);

ALTER TABLE ONLY public.whatsapp_configs FORCE ROW LEVEL SECURITY;


--
-- Name: adonis_schema id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adonis_schema ALTER COLUMN id SET DEFAULT nextval('public.adonis_schema_id_seq'::regclass);


--
-- Name: accounts accounts_accountid_providerid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_accountid_providerid_unique UNIQUE ("accountId", "providerId");


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: adonis_schema adonis_schema_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adonis_schema
    ADD CONSTRAINT adonis_schema_pkey PRIMARY KEY (id);


--
-- Name: adonis_schema_versions adonis_schema_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adonis_schema_versions
    ADD CONSTRAINT adonis_schema_versions_pkey PRIMARY KEY (version);


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_documents ai_knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: authorization_audits authorization_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_audits
    ADD CONSTRAINT authorization_audits_pkey PRIMARY KEY (id);


--
-- Name: billing_orders billing_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_pkey PRIMARY KEY (id);


--
-- Name: broadcast_recipients broadcast_recipients_messageid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_messageid_unique UNIQUE ("messageId");


--
-- Name: broadcast_recipients broadcast_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: contact_consent_events contact_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_consent_events
    ADD CONSTRAINT contact_consent_events_pkey PRIMARY KEY (id);


--
-- Name: contact_import_rows contact_import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_import_rows
    ADD CONSTRAINT contact_import_rows_pkey PRIMARY KEY (id);


--
-- Name: contact_imports contact_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_pkey PRIMARY KEY (id);


--
-- Name: contact_tags contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_assignments conversation_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_pkey PRIMARY KEY (id);


--
-- Name: conversation_notes conversation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_org_wa_contact_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_org_wa_contact_unique UNIQUE ("organizationId", "whatsappConfigId", "contactId");


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: flow_execution_logs flow_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_execution_logs
    ADD CONSTRAINT flow_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: flow_sessions flow_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_pkey PRIMARY KEY (id);


--
-- Name: flow_versions flow_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_pkey PRIMARY KEY (id);


--
-- Name: flow_versions flow_versions_unique_flow_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_unique_flow_version UNIQUE ("flowId", "versionNumber");


--
-- Name: flows flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_pkey PRIMARY KEY (id);


--
-- Name: integration_connections integration_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (id);


--
-- Name: integration_events integration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- Name: media_asset_references media_asset_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_references
    ADD CONSTRAINT media_asset_references_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organization_invitations organization_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_role_permissions organization_role_permissions_organizationid_roleid_permissioni; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permissions
    ADD CONSTRAINT organization_role_permissions_organizationid_roleid_permissioni UNIQUE ("organizationId", "roleId", "permissionId");


--
-- Name: organization_role_permissions organization_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permissions
    ADD CONSTRAINT organization_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: organization_storage_objects organization_storage_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_storage_objects
    ADD CONSTRAINT organization_storage_objects_pkey PRIMARY KEY (id);


--
-- Name: organization_storage_usages organization_storage_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_storage_usages
    ADD CONSTRAINT organization_storage_usages_pkey PRIMARY KEY ("organizationId");


--
-- Name: organization_subscriptions organization_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outbound_dispatches outbound_dispatches_message_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_dispatches
    ADD CONSTRAINT outbound_dispatches_message_id_unique UNIQUE ("messageId");


--
-- Name: outbound_dispatches outbound_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_dispatches
    ADD CONSTRAINT outbound_dispatches_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_webhook_events payment_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_unique UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platform_ai_configs platform_ai_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ai_configs
    ADD CONSTRAINT platform_ai_configs_pkey PRIMARY KEY (id);


--
-- Name: platform_ai_configs platform_ai_configs_singleton_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ai_configs
    ADD CONSTRAINT platform_ai_configs_singleton_key_unique UNIQUE ("singletonKey");


--
-- Name: role_permissions role_permissions_roleid_permissionid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_roleid_permissionid_unique UNIQUE ("roleId", "permissionId");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: unmatched_provider_receipts unmatched_provider_receipts_org_wamid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_provider_receipts
    ADD CONSTRAINT unmatched_provider_receipts_org_wamid_unique UNIQUE ("organizationId", "providerMessageId");


--
-- Name: unmatched_provider_receipts unmatched_provider_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_provider_receipts
    ADD CONSTRAINT unmatched_provider_receipts_pkey PRIMARY KEY (id);


--
-- Name: usage_meters usage_meters_org_metric_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_meters
    ADD CONSTRAINT usage_meters_org_metric_period_unique UNIQUE ("organizationId", metric, "periodStart");


--
-- Name: usage_meters usage_meters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_meters
    ADD CONSTRAINT usage_meters_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_configs whatsapp_configs_phone_number_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_configs
    ADD CONSTRAINT whatsapp_configs_phone_number_id_unique UNIQUE ("phoneNumberId");


--
-- Name: whatsapp_configs whatsapp_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_configs
    ADD CONSTRAINT whatsapp_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_chunks_document_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_document_hash ON public.ai_knowledge_chunks USING btree ("documentId", "contentHash");


--
-- Name: ai_knowledge_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_embedding ON public.ai_knowledge_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: ai_knowledge_chunks_org_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_org_document ON public.ai_knowledge_chunks USING btree ("organizationId", "documentId");


--
-- Name: ai_knowledge_chunks_org_space; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_org_space ON public.ai_knowledge_chunks USING btree ("organizationId", "embeddingSpaceId");


--
-- Name: ai_knowledge_documents_org_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_documents_org_deleted ON public.ai_knowledge_documents USING btree ("organizationId", "deletedAt", "createdAt" DESC);


--
-- Name: ai_knowledge_documents_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_documents_org_status ON public.ai_knowledge_documents USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: ai_usage_logs_org_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_logs_org_conversation_created ON public.ai_usage_logs USING btree ("organizationId", "conversationId", "createdAt" DESC);


--
-- Name: api_keys_key_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_keys_key_hash_unique ON public.api_keys USING btree ("keyHash");


--
-- Name: api_keys_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_org_id ON public.api_keys USING btree ("organizationId");


--
-- Name: authorization_audits_role_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authorization_audits_role_lookup ON public.authorization_audits USING btree ("organizationId", "roleId", "createdAt" DESC) WHERE ("roleId" IS NOT NULL);


--
-- Name: billing_orders_gateway_order_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_orders_gateway_order_id_unique ON public.billing_orders USING btree (gateway, "gatewayOrderId");


--
-- Name: billing_orders_org_plan_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_orders_org_plan_created ON public.billing_orders USING btree ("organizationId", "planId", status) WHERE (status = 'created'::text);


--
-- Name: billing_orders_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_orders_org_status ON public.billing_orders USING btree ("organizationId", status);


--
-- Name: broadcast_recipients_broadcast_contact_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX broadcast_recipients_broadcast_contact_unique ON public.broadcast_recipients USING btree ("broadcastId", "contactId");


--
-- Name: broadcast_recipients_org_broadcast_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcast_recipients_org_broadcast_status ON public.broadcast_recipients USING btree ("organizationId", "broadcastId", status);


--
-- Name: broadcasts_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_name_trgm ON public.broadcasts USING gin (name public.gin_trgm_ops);


--
-- Name: broadcasts_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_org_created_at ON public.broadcasts USING btree ("organizationId", "createdAt" DESC);


--
-- Name: broadcasts_org_header_media; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_org_header_media ON public.broadcasts USING btree ("organizationId", "headerMediaAssetId") WHERE ("headerMediaAssetId" IS NOT NULL);


--
-- Name: broadcasts_org_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_org_status_scheduled ON public.broadcasts USING btree ("organizationId", status, "scheduledAt");


--
-- Name: broadcasts_org_wa_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_org_wa_config ON public.broadcasts USING btree ("organizationId", "whatsappConfigId") WHERE ("whatsappConfigId" IS NOT NULL);


--
-- Name: contact_consent_events_org_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_consent_events_org_contact ON public.contact_consent_events USING btree ("organizationId", "contactId");


--
-- Name: contact_import_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_import_org_status ON public.contact_imports USING btree ("organizationId", status);


--
-- Name: contact_import_rows_import_row; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_import_rows_import_row ON public.contact_import_rows USING btree ("importId", "rowNumber");


--
-- Name: contact_tags_contact_tag_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_tags_contact_tag_unique ON public.contact_tags USING btree ("contactId", "tagId");


--
-- Name: contact_tags_org_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_tags_org_contact ON public.contact_tags USING btree ("organizationId", "contactId");


--
-- Name: contact_tags_org_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_tags_org_tag ON public.contact_tags USING btree ("organizationId", "tagId");


--
-- Name: contacts_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_org_created_at ON public.contacts USING btree ("organizationId", "createdAt" DESC);


--
-- Name: contacts_org_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_org_email ON public.contacts USING btree ("organizationId", email) WHERE (email IS NOT NULL);


--
-- Name: contacts_org_marketing_opt_in; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_org_marketing_opt_in ON public.contacts USING btree ("organizationId", "marketingOptIn") WHERE ("deletedAt" IS NULL);


--
-- Name: contacts_org_phone_normalized_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_org_phone_normalized_unique ON public.contacts USING btree ("organizationId", "phoneNormalized") WHERE ("deletedAt" IS NULL);


--
-- Name: conversation_assignments_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_assignments_conversation_created_at ON public.conversation_assignments USING btree ("conversationId", "createdAt" DESC);


--
-- Name: conversation_assignments_org_agent_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_assignments_org_agent_created_at ON public.conversation_assignments USING btree ("organizationId", "agentUserId", "createdAt");


--
-- Name: conversation_notes_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_notes_conversation_created_at ON public.conversation_notes USING btree ("conversationId", "createdAt" DESC);


--
-- Name: conversations_org_agent_status_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_agent_status_last_message ON public.conversations USING btree ("organizationId", "assignedAgentId", status, "lastMessageAt" DESC);


--
-- Name: conversations_org_ai_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_ai_mode ON public.conversations USING btree ("organizationId", "aiMode");


--
-- Name: conversations_org_attributed_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_attributed_campaign ON public.conversations USING btree ("organizationId", "attributedCampaignId") WHERE ("attributedCampaignId" IS NOT NULL);


--
-- Name: conversations_org_status_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_status_last_message ON public.conversations USING btree ("organizationId", status, "lastMessageAt" DESC);


--
-- Name: conversations_org_wa_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_wa_last_message ON public.conversations USING btree ("organizationId", "whatsappConfigId", "lastMessageAt" DESC);


--
-- Name: flow_execution_logs_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flow_execution_logs_session_created ON public.flow_execution_logs USING btree ("flowSessionId", "createdAt");


--
-- Name: flow_sessions_org_conversation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flow_sessions_org_conversation_status ON public.flow_sessions USING btree ("organizationId", "conversationId", status);


--
-- Name: flows_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flows_org_status ON public.flows USING btree ("organizationId", status);


--
-- Name: idx_account_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_user_id ON public.accounts USING btree ("userId");


--
-- Name: idx_session_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_user_id ON public.sessions USING btree ("userId");


--
-- Name: idx_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_active ON public.users USING btree ("isActive") WHERE ("isDeleted" = false);


--
-- Name: idx_user_email_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_email_live ON public.users USING btree (email) WHERE ("isDeleted" = false);


--
-- Name: idx_verification_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_identifier ON public.verifications USING btree (identifier);


--
-- Name: integration_connections_org_provider_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_connections_org_provider_unique ON public.integration_connections USING btree ("organizationId", provider);


--
-- Name: integration_events_accepted_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_events_accepted_received ON public.integration_events USING btree ("receivedAt") WHERE (status = 'accepted'::text);


--
-- Name: integration_events_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_events_idempotency_unique ON public.integration_events USING btree ("organizationId", provider, "externalEventId");


--
-- Name: integration_events_org_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_events_org_received ON public.integration_events USING btree ("organizationId", "receivedAt" DESC);


--
-- Name: integration_events_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_events_org_type ON public.integration_events USING btree ("organizationId", "eventType");


--
-- Name: invoice_line_items_invoice_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_items_invoice_sort ON public.invoice_line_items USING btree ("invoiceId", "sortOrder");


--
-- Name: invoice_line_items_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_items_org_id ON public.invoice_line_items USING btree ("organizationId");


--
-- Name: invoices_invoice_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_invoice_number_unique ON public.invoices USING btree ("invoiceNumber");


--
-- Name: invoices_org_issue_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_org_issue_date ON public.invoices USING btree ("organizationId", "issueDate" DESC);


--
-- Name: invoices_payment_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_payment_transaction_id ON public.invoices USING btree ("paymentTransactionId") WHERE ("paymentTransactionId" IS NOT NULL);


--
-- Name: invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status ON public.invoices USING btree (status);


--
-- Name: invoices_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_subscription_id ON public.invoices USING btree ("subscriptionId") WHERE ("subscriptionId" IS NOT NULL);


--
-- Name: media_asset_references_asset_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_references_asset_live ON public.media_asset_references USING btree ("mediaAssetId", "protectedUntil");


--
-- Name: media_asset_references_owner_asset_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_asset_references_owner_asset_unique ON public.media_asset_references USING btree ("ownerType", "ownerId", "mediaAssetId");


--
-- Name: media_assets_org_state_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_org_state_created ON public.media_assets USING btree ("organizationId", state, "createdAt");


--
-- Name: media_assets_org_uploaded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_org_uploaded_at ON public.media_assets USING btree ("organizationId", "uploadedAt" DESC);


--
-- Name: media_assets_storage_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_assets_storage_key_unique ON public.media_assets USING btree ("storageKey");


--
-- Name: media_assets_storage_object_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_assets_storage_object_id_unique ON public.media_assets USING btree ("storageObjectId") WHERE ("storageObjectId" IS NOT NULL);


--
-- Name: message_templates_org_name_language_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_templates_org_name_language_unique ON public.message_templates USING btree ("organizationId", name, COALESCE(language, ''::text));


--
-- Name: message_templates_org_status_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_templates_org_status_name ON public.message_templates USING btree ("organizationId", status, name);


--
-- Name: message_templates_org_wa_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_templates_org_wa_config ON public.message_templates USING btree ("organizationId", "whatsappConfigId") WHERE ("whatsappConfigId" IS NOT NULL);


--
-- Name: messages_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_created_at ON public.messages USING btree ("conversationId", "createdAt" DESC);


--
-- Name: messages_conversation_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_occurred_at ON public.messages USING btree ("conversationId", "occurredAt" DESC);


--
-- Name: messages_conversation_sender_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_sender_created_at ON public.messages USING btree ("conversationId", "senderType", "createdAt");


--
-- Name: messages_message_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_message_template_id ON public.messages USING btree ("messageTemplateId") WHERE ("messageTemplateId" IS NOT NULL);


--
-- Name: messages_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_org_created_at ON public.messages USING btree ("organizationId", "createdAt" DESC);


--
-- Name: messages_org_provider_message_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX messages_org_provider_message_id_unique ON public.messages USING btree ("organizationId", "providerMessageId") WHERE ("providerMessageId" IS NOT NULL);


--
-- Name: messages_org_sender_client_idempotency_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX messages_org_sender_client_idempotency_key_unique ON public.messages USING btree ("organizationId", "senderId", "clientIdempotencyKey") WHERE (("clientIdempotencyKey" IS NOT NULL) AND ("senderId" IS NOT NULL));


--
-- Name: messages_org_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_org_status_created_at ON public.messages USING btree ("organizationId", status, "createdAt" DESC);


--
-- Name: organization_invitations_org_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_invitations_org_pending_unique ON public.organization_invitations USING btree ("organizationId", email) WHERE (status = 'pending'::text);


--
-- Name: organization_members_active_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_active_org ON public.organization_members USING btree ("organizationId") WHERE ("isDeleted" = false);


--
-- Name: organization_members_org_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_org_role ON public.organization_members USING btree ("organizationId", "roleId");


--
-- Name: organization_members_org_user_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_members_org_user_live ON public.organization_members USING btree ("organizationId", "userId") WHERE ("isDeleted" = false);


--
-- Name: organization_storage_objects_org_state_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_storage_objects_org_state_created ON public.organization_storage_objects USING btree ("organizationId", state, "createdAt");


--
-- Name: organization_storage_objects_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_storage_objects_owner ON public.organization_storage_objects USING btree ("ownerType", "ownerId") WHERE ("ownerId" IS NOT NULL);


--
-- Name: organization_storage_objects_purge_after; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_storage_objects_purge_after ON public.organization_storage_objects USING btree ("purgeAfter") WHERE (((state)::text = 'deleted'::text) AND ("purgeAfter" IS NOT NULL));


--
-- Name: organization_storage_objects_storage_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_storage_objects_storage_key_unique ON public.organization_storage_objects USING btree ("storageKey");


--
-- Name: organization_subscriptions_gateway_subscription_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_subscriptions_gateway_subscription_id_unique ON public.organization_subscriptions USING btree (gateway, "gatewaySubscriptionId") WHERE ("gatewaySubscriptionId" IS NOT NULL);


--
-- Name: organization_subscriptions_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_subscriptions_org_status ON public.organization_subscriptions USING btree ("organizationId", status);


--
-- Name: organizations_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_email_unique ON public.organizations USING btree (email) WHERE ("deletedAt" IS NULL);


--
-- Name: organizations_gateway_customer_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_gateway_customer_id_unique ON public.organizations USING btree (gateway, "gatewayCustomerId") WHERE ("gatewayCustomerId" IS NOT NULL);


--
-- Name: organizations_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_unique ON public.organizations USING btree (slug) WHERE ("deletedAt" IS NULL);


--
-- Name: organizations_status_pending_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_status_pending_created_at_idx ON public.organizations USING btree (status, "createdAt") WHERE (((status)::text = 'pending_setup'::text) AND ("deletedAt" IS NULL));


--
-- Name: outbound_dispatches_lock_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_dispatches_lock_expires ON public.outbound_dispatches USING btree ("lockExpiresAt") WHERE ((status = 'processing'::text) AND ("lockExpiresAt" IS NOT NULL));


--
-- Name: outbound_dispatches_org_config_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_dispatches_org_config_status ON public.outbound_dispatches USING btree ("organizationId", "whatsappConfigId", status);


--
-- Name: outbound_dispatches_org_status_next_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_dispatches_org_status_next_attempt ON public.outbound_dispatches USING btree ("organizationId", status, "nextAttemptAt");


--
-- Name: payment_transactions_gateway_order_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_transactions_gateway_order_id_unique ON public.payment_transactions USING btree (gateway, "gatewayOrderId") WHERE ("gatewayOrderId" IS NOT NULL);


--
-- Name: payment_transactions_gateway_payment_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_transactions_gateway_payment_id_unique ON public.payment_transactions USING btree (gateway, "gatewayPaymentId") WHERE ("gatewayPaymentId" IS NOT NULL);


--
-- Name: payment_transactions_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_org_created_at ON public.payment_transactions USING btree ("organizationId", "createdAt" DESC);


--
-- Name: payment_transactions_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_subscription_id ON public.payment_transactions USING btree ("subscriptionId");


--
-- Name: payment_webhook_events_lock_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_webhook_events_lock_expires ON public.payment_webhook_events USING btree ("lockExpiresAt") WHERE ((status = 'processing'::text) AND ("lockExpiresAt" IS NOT NULL));


--
-- Name: payment_webhook_events_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_webhook_events_org_created_at ON public.payment_webhook_events USING btree ("organizationId", "createdAt" DESC);


--
-- Name: payment_webhook_events_provider_event_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_webhook_events_provider_event_id_unique ON public.payment_webhook_events USING btree (provider, "eventId");


--
-- Name: payment_webhook_events_status_next_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_webhook_events_status_next_attempt ON public.payment_webhook_events USING btree (status, "nextAttemptAt");


--
-- Name: plans_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_code_unique ON public.plans USING btree (code);


--
-- Name: plans_gateway_plan_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_gateway_plan_id_unique ON public.plans USING btree (gateway, "gatewayPlanId") WHERE ("gatewayPlanId" IS NOT NULL);


--
-- Name: roles_global_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_global_name_unique ON public.roles USING btree (name) WHERE ("organizationId" IS NULL);


--
-- Name: roles_org_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_org_name_unique ON public.roles USING btree (name, "organizationId") WHERE ("organizationId" IS NOT NULL);


--
-- Name: sessions_active_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_active_organization ON public.sessions USING btree ("activeOrganizationId");


--
-- Name: tags_org_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_org_name_unique ON public.tags USING btree ("organizationId", name);


--
-- Name: unmatched_provider_receipts_config_wamid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unmatched_provider_receipts_config_wamid ON public.unmatched_provider_receipts USING btree ("whatsappConfigId", "providerMessageId");


--
-- Name: unmatched_provider_receipts_org_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unmatched_provider_receipts_org_expires ON public.unmatched_provider_receipts USING btree ("organizationId", "expiresAt");


--
-- Name: user_roles_global_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_global_user_unique ON public.user_roles USING btree ("userId") WHERE ("organizationId" IS NULL);


--
-- Name: user_roles_user_org_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_user_org_unique ON public.user_roles USING btree ("userId", "organizationId") WHERE ("organizationId" IS NOT NULL);


--
-- Name: whatsapp_configs_org_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_configs_org_created_at ON public.whatsapp_configs USING btree ("organizationId", "createdAt" DESC);


--
-- Name: whatsapp_configs_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_configs_org_status ON public.whatsapp_configs USING btree ("organizationId", status);


--
-- Name: sessions trg_block_inactive_login; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_inactive_login BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.block_session_for_inactive_user();


--
-- Name: user_roles trg_ensure_one_owner_per_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_one_owner_per_org BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.ensure_one_owner_per_org();


--
-- Name: organization_role_permissions trg_reject_custom_role_org_overrides; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reject_custom_role_org_overrides BEFORE INSERT OR UPDATE ON public.organization_role_permissions FOR EACH ROW EXECUTE FUNCTION public.reject_custom_role_org_overrides();


--
-- Name: organization_role_permissions trg_reject_immutable_role_permission_overrides; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reject_immutable_role_permission_overrides BEFORE INSERT OR UPDATE ON public.organization_role_permissions FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_role_permission_overrides();


--
-- Name: accounts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_knowledge_chunks trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.ai_knowledge_chunks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_knowledge_documents trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.ai_knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: billing_orders trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.billing_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: broadcasts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_imports trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: conversation_notes trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.conversation_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: conversations trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: media_asset_references trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.media_asset_references FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: media_assets trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: message_templates trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: messages trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_storage_objects trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organization_storage_objects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_storage_usages trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organization_storage_usages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organization_subscriptions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outbound_dispatches trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.outbound_dispatches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment_transactions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plans trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_ai_configs trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.platform_ai_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: roles trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sessions trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: unmatched_provider_receipts trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.unmatched_provider_receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: usage_meters trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.usage_meters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: verifications trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_configs trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.whatsapp_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_user_deactivation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_deactivation AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_user_deactivation();


--
-- Name: accounts accounts_userid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_userid_foreign FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT "ai_knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT "ai_knowledge_chunks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_documents ai_knowledge_documents_mediaAssetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT "ai_knowledge_documents_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: ai_knowledge_documents ai_knowledge_documents_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT "ai_knowledge_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_usage_logs ai_usage_logs_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT "ai_usage_logs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: ai_usage_logs ai_usage_logs_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT "ai_usage_logs_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: ai_usage_logs ai_usage_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT "ai_usage_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: api_keys api_keys_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: authorization_audits authorization_audits_actoruserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_audits
    ADD CONSTRAINT authorization_audits_actoruserid_foreign FOREIGN KEY ("actorUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: authorization_audits authorization_audits_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_audits
    ADD CONSTRAINT authorization_audits_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: authorization_audits authorization_audits_permissionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_audits
    ADD CONSTRAINT authorization_audits_permissionid_foreign FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON DELETE SET NULL;


--
-- Name: authorization_audits authorization_audits_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_audits
    ADD CONSTRAINT authorization_audits_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE SET NULL;


--
-- Name: billing_orders billing_orders_invoiceid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_invoiceid_foreign FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: billing_orders billing_orders_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: billing_orders billing_orders_paymenttransactionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_paymenttransactionid_foreign FOREIGN KEY ("paymentTransactionId") REFERENCES public.payment_transactions(id) ON DELETE SET NULL;


--
-- Name: billing_orders billing_orders_planid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_planid_foreign FOREIGN KEY ("planId") REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: billing_orders billing_orders_subscriptionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_subscriptionid_foreign FOREIGN KEY ("subscriptionId") REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL;


--
-- Name: broadcast_recipients broadcast_recipients_broadcastid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_broadcastid_foreign FOREIGN KEY ("broadcastId") REFERENCES public.broadcasts(id) ON DELETE CASCADE;


--
-- Name: broadcast_recipients broadcast_recipients_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: broadcast_recipients broadcast_recipients_messageid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_messageid_foreign FOREIGN KEY ("messageId") REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: broadcast_recipients broadcast_recipients_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: broadcasts broadcasts_headerMediaAssetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT "broadcasts_headerMediaAssetId_fkey" FOREIGN KEY ("headerMediaAssetId") REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: broadcasts broadcasts_messagetemplateid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_messagetemplateid_foreign FOREIGN KEY ("messageTemplateId") REFERENCES public.message_templates(id) ON DELETE SET NULL;


--
-- Name: broadcasts broadcasts_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_whatsappconfigid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_whatsappconfigid_foreign FOREIGN KEY ("whatsappConfigId") REFERENCES public.whatsapp_configs(id) ON DELETE SET NULL;


--
-- Name: contact_consent_events contact_consent_events_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_consent_events
    ADD CONSTRAINT contact_consent_events_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_consent_events contact_consent_events_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_consent_events
    ADD CONSTRAINT contact_consent_events_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_import_rows contact_import_rows_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_import_rows
    ADD CONSTRAINT contact_import_rows_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contact_import_rows contact_import_rows_importid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_import_rows
    ADD CONSTRAINT contact_import_rows_importid_foreign FOREIGN KEY ("importId") REFERENCES public.contact_imports(id) ON DELETE CASCADE;


--
-- Name: contact_import_rows contact_import_rows_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_import_rows
    ADD CONSTRAINT contact_import_rows_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_imports contact_imports_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: contact_imports contact_imports_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_tagid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tagid_foreign FOREIGN KEY ("tagId") REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: conversation_assignments conversation_assignments_agentuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_agentuserid_foreign FOREIGN KEY ("agentUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversation_assignments conversation_assignments_assignedbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_assignedbyuserid_foreign FOREIGN KEY ("assignedByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversation_assignments conversation_assignments_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_assignments conversation_assignments_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_assignments
    ADD CONSTRAINT conversation_assignments_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_authoruserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_authoruserid_foreign FOREIGN KEY ("authorUserId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_assignedagentid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assignedagentid_foreign FOREIGN KEY ("assignedAgentId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_attributedCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "conversations_attributedCampaignId_fkey" FOREIGN KEY ("attributedCampaignId") REFERENCES public.broadcasts(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_whatsappconfigid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_whatsappconfigid_foreign FOREIGN KEY ("whatsappConfigId") REFERENCES public.whatsapp_configs(id) ON DELETE CASCADE;


--
-- Name: flow_execution_logs flow_execution_logs_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_execution_logs
    ADD CONSTRAINT flow_execution_logs_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: flow_execution_logs flow_execution_logs_flowsessionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_execution_logs
    ADD CONSTRAINT flow_execution_logs_flowsessionid_foreign FOREIGN KEY ("flowSessionId") REFERENCES public.flow_sessions(id) ON DELETE CASCADE;


--
-- Name: flow_execution_logs flow_execution_logs_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_execution_logs
    ADD CONSTRAINT flow_execution_logs_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: flow_sessions flow_sessions_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: flow_sessions flow_sessions_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: flow_sessions flow_sessions_flowid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_flowid_foreign FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_sessions flow_sessions_flowversionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_flowversionid_foreign FOREIGN KEY ("flowVersionId") REFERENCES public.flow_versions(id) ON DELETE CASCADE;


--
-- Name: flow_sessions flow_sessions_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_sessions
    ADD CONSTRAINT flow_sessions_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: flow_versions flow_versions_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: flow_versions flow_versions_flowid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_flowid_foreign FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_versions flow_versions_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: flows flows_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: flows flows_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: flows flows_published_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_published_version_fk FOREIGN KEY ("publishedVersionId") REFERENCES public.flow_versions(id) ON DELETE SET NULL;


--
-- Name: integration_connections integration_connections_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_connectionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_connectionid_foreign FOREIGN KEY ("connectionId") REFERENCES public.integration_connections(id) ON DELETE SET NULL;


--
-- Name: integration_events integration_events_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_invoiceid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoiceid_foreign FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_paymenttransactionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_paymenttransactionid_foreign FOREIGN KEY ("paymentTransactionId") REFERENCES public.payment_transactions(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_planid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_planid_foreign FOREIGN KEY ("planId") REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_sourceinvoiceid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_sourceinvoiceid_foreign FOREIGN KEY ("sourceInvoiceId") REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_subscriptionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscriptionid_foreign FOREIGN KEY ("subscriptionId") REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL;


--
-- Name: media_asset_references media_asset_references_mediaassetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_references
    ADD CONSTRAINT media_asset_references_mediaassetid_foreign FOREIGN KEY ("mediaAssetId") REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_asset_references media_asset_references_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_references
    ADD CONSTRAINT media_asset_references_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_storageObjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT "media_assets_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES public.organization_storage_objects(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_uploadedby_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_uploadedby_foreign FOREIGN KEY ("uploadedBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: message_templates message_templates_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: message_templates message_templates_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: message_templates message_templates_whatsappconfigid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_whatsappconfigid_foreign FOREIGN KEY ("whatsappConfigId") REFERENCES public.whatsapp_configs(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_mediaassetid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_mediaassetid_foreign FOREIGN KEY ("mediaAssetId") REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: messages messages_message_template_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_message_template_id_foreign FOREIGN KEY ("messageTemplateId") REFERENCES public.message_templates(id) ON DELETE SET NULL;


--
-- Name: messages messages_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: messages messages_replytomessageid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_replytomessageid_foreign FOREIGN KEY ("replyToMessageId") REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_senderid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_senderid_foreign FOREIGN KEY ("senderId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_actoruserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actoruserid_foreign FOREIGN KEY ("actorUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_contactid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_contactid_foreign FOREIGN KEY ("contactId") REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_conversationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_conversationid_foreign FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_userid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_userid_foreign FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_inviterid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_inviterid_foreign FOREIGN KEY ("inviterId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_userid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_userid_foreign FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organization_role_permissions organization_role_permissions_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permissions
    ADD CONSTRAINT organization_role_permissions_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_role_permissions organization_role_permissions_permissionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permissions
    ADD CONSTRAINT organization_role_permissions_permissionid_foreign FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: organization_role_permissions organization_role_permissions_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permissions
    ADD CONSTRAINT organization_role_permissions_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: organization_storage_objects organization_storage_objects_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_storage_objects
    ADD CONSTRAINT organization_storage_objects_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_storage_usages organization_storage_usages_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_storage_usages
    ADD CONSTRAINT organization_storage_usages_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_subscriptions organization_subscriptions_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_subscriptions organization_subscriptions_planid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_planid_foreign FOREIGN KEY ("planId") REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: outbound_dispatches outbound_dispatches_messageid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_dispatches
    ADD CONSTRAINT outbound_dispatches_messageid_foreign FOREIGN KEY ("messageId") REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: outbound_dispatches outbound_dispatches_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_dispatches
    ADD CONSTRAINT outbound_dispatches_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: outbound_dispatches outbound_dispatches_whatsappconfigid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_dispatches
    ADD CONSTRAINT outbound_dispatches_whatsappconfigid_foreign FOREIGN KEY ("whatsappConfigId") REFERENCES public.whatsapp_configs(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_subscription_id_fkey FOREIGN KEY ("subscriptionId") REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL;


--
-- Name: payment_webhook_events payment_webhook_events_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_webhook_events
    ADD CONSTRAINT payment_webhook_events_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: platform_ai_configs platform_ai_configs_updatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ai_configs
    ADD CONSTRAINT "platform_ai_configs_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_permissionid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permissionid_foreign FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_activeorganizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_activeorganizationid_foreign FOREIGN KEY ("activeOrganizationId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_userid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_userid_foreign FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tags tags_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tags tags_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: unmatched_provider_receipts unmatched_provider_receipts_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_provider_receipts
    ADD CONSTRAINT unmatched_provider_receipts_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: unmatched_provider_receipts unmatched_provider_receipts_whatsappconfigid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unmatched_provider_receipts
    ADD CONSTRAINT unmatched_provider_receipts_whatsappconfigid_foreign FOREIGN KEY ("whatsappConfigId") REFERENCES public.whatsapp_configs(id) ON DELETE CASCADE;


--
-- Name: usage_meters usage_meters_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_meters
    ADD CONSTRAINT usage_meters_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_roleid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_roleid_foreign FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_userid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_userid_foreign FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_updatedby_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_updatedby_foreign FOREIGN KEY ("updatedBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_configs whatsapp_configs_createdbyuserid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_configs
    ADD CONSTRAINT whatsapp_configs_createdbyuserid_foreign FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_configs whatsapp_configs_organizationid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_configs
    ADD CONSTRAINT whatsapp_configs_organizationid_foreign FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_knowledge_chunks_tenant_isolation ON public.ai_knowledge_chunks USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: ai_knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_documents ai_knowledge_documents_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_knowledge_documents_tenant_isolation ON public.ai_knowledge_documents USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs ai_usage_logs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_logs_tenant_isolation ON public.ai_usage_logs USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys api_keys_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_tenant_isolation ON public.api_keys USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: billing_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_orders billing_orders_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_orders_tenant_isolation ON public.billing_orders USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: broadcast_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcast_recipients broadcast_recipients_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broadcast_recipients_tenant_isolation ON public.broadcast_recipients USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcasts broadcasts_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broadcasts_tenant_isolation ON public.broadcasts USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: contact_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_consent_events contact_consent_events_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_consent_events_tenant_isolation ON public.contact_consent_events USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: contact_import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_import_rows contact_import_rows_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_import_rows_tenant_isolation ON public.contact_import_rows USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: contact_imports contact_import_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_import_tenant_isolation ON public.contact_imports USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: contact_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags contact_tags_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_tags_tenant_isolation ON public.contact_tags USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_tenant_isolation ON public.contacts USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: conversation_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_assignments conversation_assignments_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_assignments_tenant_isolation ON public.conversation_assignments USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: conversation_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_notes conversation_notes_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_notes_tenant_isolation ON public.conversation_notes USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_tenant_isolation ON public.conversations USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: flow_execution_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_execution_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_execution_logs flow_execution_logs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY flow_execution_logs_tenant_isolation ON public.flow_execution_logs USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: flow_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_sessions flow_sessions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY flow_sessions_tenant_isolation ON public.flow_sessions USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: flow_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_versions flow_versions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY flow_versions_tenant_isolation ON public.flow_versions USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

--
-- Name: flows flows_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY flows_tenant_isolation ON public.flows USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: integration_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_connections integration_connections_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_connections_tenant_isolation ON public.integration_connections USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: integration_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_events integration_events_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_events_tenant_isolation ON public.integration_events USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items invoice_line_items_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_tenant_isolation ON public.invoice_line_items USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_tenant_isolation ON public.invoices USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: media_asset_references; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_asset_references ENABLE ROW LEVEL SECURITY;

--
-- Name: media_asset_references media_asset_references_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_asset_references_tenant_isolation ON public.media_asset_references USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: media_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: media_assets media_assets_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_assets_tenant_isolation ON public.media_assets USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: message_templates message_templates_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_templates_tenant_isolation ON public.message_templates USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_tenant_isolation ON public.messages USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: organization_storage_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_storage_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_storage_objects organization_storage_objects_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_storage_objects_tenant_isolation ON public.organization_storage_objects USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: organization_storage_usages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_storage_usages ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_storage_usages organization_storage_usages_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_storage_usages_tenant_isolation ON public.organization_storage_usages USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: organization_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_subscriptions organization_subscriptions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscriptions_tenant_isolation ON public.organization_subscriptions USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: outbound_dispatches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_dispatches ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_dispatches outbound_dispatches_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbound_dispatches_tenant_isolation ON public.outbound_dispatches USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: payment_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_transactions payment_transactions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_transactions_tenant_isolation ON public.payment_transactions USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_tenant_isolation ON public.tags USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: unmatched_provider_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unmatched_provider_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: unmatched_provider_receipts unmatched_provider_receipts_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY unmatched_provider_receipts_tenant_isolation ON public.unmatched_provider_receipts USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: usage_meters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_meters usage_meters_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_meters_tenant_isolation ON public.usage_meters USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: whatsapp_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_configs whatsapp_configs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_configs_tenant_isolation ON public.whatsapp_configs USING (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid)) WITH CHECK (("organizationId" = (NULLIF(current_setting('app.current_organization_id'::text, true), ''::text))::uuid));


--
-- Name: whatsapp_configs whatsapp_configs_webhook_phone_lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_configs_webhook_phone_lookup ON public.whatsapp_configs FOR SELECT USING (("phoneNumberId" = NULLIF(current_setting('app.webhook_phone_number_id'::text, true), ''::text)));


--
-- PostgreSQL database dump complete
--

\unrestrict 1xjcz8gVsKscw1k5bBaRXwV81QJhnslmV8X9yFi8lqY3GywvpugrIOooK8l1jAT

