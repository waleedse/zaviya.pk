import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'ur');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor', 'bot');
  CREATE TYPE "public"."enum_media_license" AS ENUM('own', 'ai-generated', 'handout', 'wikimedia', 'stock');
  CREATE TYPE "public"."enum_articles_embeds_type" AS ENUM('x', 'instagram', 'youtube');
  CREATE TYPE "public"."enum_articles_priority" AS ENUM('normal', 'high', 'breaking');
  CREATE TYPE "public"."enum_articles_workflow" AS ENUM('draft', 'in_review', 'approved', 'published', 'retracted');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_embeds_type" AS ENUM('x', 'instagram', 'youtube');
  CREATE TYPE "public"."enum__articles_v_version_priority" AS ENUM('normal', 'high', 'breaking');
  CREATE TYPE "public"."enum__articles_v_version_workflow" AS ENUM('draft', 'in_review', 'approved', 'published', 'retracted');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_published_locale" AS ENUM('en', 'ur');
  CREATE TYPE "public"."enum_categories_slug" AS ENUM('pakistan', 'world', 'business', 'tech-telecom', 'autos', 'cricket', 'education-jobs', 'trending');
  CREATE TYPE "public"."enum_data_pages_key" AS ENUM('gold', 'usd-pkr', 'petrol');
  CREATE TYPE "public"."enum_data_points_series" AS ENUM('gold_24k_tola', 'gold_22k_tola', 'usd_interbank', 'usd_open_buy', 'usd_open_sell', 'petrol_super', 'hsd', 'kerosene');
  CREATE TYPE "public"."enum_sources_type" AS ENUM('rss', 'gnews', 'x_account', 'x_list', 'instagram', 'data');
  CREATE TYPE "public"."enum_sources_language" AS ENUM('en', 'ur', 'mixed');
  CREATE TYPE "public"."enum_source_items_lang" AS ENUM('en', 'ur');
  CREATE TYPE "public"."enum_story_clusters_status" AS ENUM('new', 'triaged', 'rejected', 'in_review', 'writing', 'published', 'updated');
  CREATE TYPE "public"."enum_review_queue_decision" AS ENUM('approve', 'reject', 'hold', 'edit');
  CREATE TYPE "public"."enum_social_posts_platform" AS ENUM('facebook', 'instagram', 'x', 'whatsapp');
  CREATE TYPE "public"."enum_social_posts_format" AS ENUM('link', 'card', 'carousel', 'reel', 'text');
  CREATE TYPE "public"."enum_social_posts_status" AS ENUM('queued', 'posting', 'posted', 'failed', 'deleted');
  CREATE TYPE "public"."enum_social_posts_via" AS ENUM('api', 'extension');
  CREATE TYPE "public"."enum_prompt_versions_key" AS ENUM('triage', 'write_en', 'write_ur', 'qa', 'social_copy');
  CREATE TYPE "public"."enum_push_subscriptions_locale" AS ENUM('en', 'ur');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"credit" varchar,
  	"license" "enum_media_license",
  	"is_ai_generated" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumb_url" varchar,
  	"sizes_thumb_width" numeric,
  	"sizes_thumb_height" numeric,
  	"sizes_thumb_mime_type" varchar,
  	"sizes_thumb_filesize" numeric,
  	"sizes_thumb_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar,
  	"sizes_square_url" varchar,
  	"sizes_square_width" numeric,
  	"sizes_square_height" numeric,
  	"sizes_square_mime_type" varchar,
  	"sizes_square_filesize" numeric,
  	"sizes_square_filename" varchar,
  	"sizes_portrait_url" varchar,
  	"sizes_portrait_width" numeric,
  	"sizes_portrait_height" numeric,
  	"sizes_portrait_mime_type" varchar,
  	"sizes_portrait_filesize" numeric,
  	"sizes_portrait_filename" varchar
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "articles_title_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" varchar
  );
  
  CREATE TABLE "articles_key_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"point" varchar
  );
  
  CREATE TABLE "articles_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"q" varchar,
  	"a" varchar
  );
  
  CREATE TABLE "articles_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"url" varchar,
  	"tier" numeric,
  	"published_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "articles_embeds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_articles_embeds_type",
  	"url" varchar
  );
  
  CREATE TABLE "articles_updates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"text_en" varchar,
  	"text_ur" varchar
  );
  
  CREATE TABLE "articles_corrections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "articles_corrections_locales" (
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"category_id" integer,
  	"author_id" integer,
  	"hero_image_id" integer,
  	"story_cluster_id" integer,
  	"is_live" boolean DEFAULT false,
  	"is_breaking" boolean DEFAULT false,
  	"priority" "enum_articles_priority" DEFAULT 'normal',
  	"workflow" "enum_articles_workflow" DEFAULT 'draft',
  	"published_at" timestamp(3) with time zone,
  	"seo_og_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"ai_model" varchar,
  	"ai_prompt_version" varchar,
  	"ai_triage_score" numeric,
  	"ai_qa_score" numeric,
  	"ai_originality" numeric,
  	"ai_generated_at" timestamp(3) with time zone,
  	"ai_tokens" numeric,
  	"reading_time" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"dek" varchar,
  	"body" jsonb,
  	"what_it_means" jsonb,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"seo_canonical" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "_articles_v_version_title_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_key_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"point" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"q" varchar,
  	"a" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"url" varchar,
  	"tier" numeric,
  	"published_at" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_embeds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum__articles_v_version_embeds_type",
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_updates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"text_en" varchar,
  	"text_ur" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_corrections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_corrections_locales" (
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_category_id" integer,
  	"version_author_id" integer,
  	"version_hero_image_id" integer,
  	"version_story_cluster_id" integer,
  	"version_is_live" boolean DEFAULT false,
  	"version_is_breaking" boolean DEFAULT false,
  	"version_priority" "enum__articles_v_version_priority" DEFAULT 'normal',
  	"version_workflow" "enum__articles_v_version_workflow" DEFAULT 'draft',
  	"version_published_at" timestamp(3) with time zone,
  	"version_seo_og_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_ai_model" varchar,
  	"version_ai_prompt_version" varchar,
  	"version_ai_triage_score" numeric,
  	"version_ai_qa_score" numeric,
  	"version_ai_originality" numeric,
  	"version_ai_generated_at" timestamp(3) with time zone,
  	"version_ai_tokens" numeric,
  	"version_reading_time" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__articles_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_articles_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_dek" varchar,
  	"version_body" jsonb,
  	"version_what_it_means" jsonb,
  	"version_seo_meta_title" varchar,
  	"version_seo_meta_description" varchar,
  	"version_seo_canonical" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" "enum_categories_slug" NOT NULL,
  	"color" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"show_in_nav" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "authors_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"role" varchar,
  	"avatar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors_locales" (
  	"bio" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar NOT NULL,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "data_pages_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"q" varchar NOT NULL,
  	"a" varchar NOT NULL
  );
  
  CREATE TABLE "data_pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" "enum_data_pages_key" NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"latest_snapshot" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_pages_locales" (
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "data_points" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"series" "enum_data_points_series" NOT NULL,
  	"city" varchar,
  	"value" numeric NOT NULL,
  	"unit" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"observed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"type" "enum_sources_type" NOT NULL,
  	"trust_tier" numeric NOT NULL,
  	"language" "enum_sources_language",
  	"category_hint" varchar,
  	"poll_interval_sec" numeric DEFAULT 300,
  	"enabled" boolean DEFAULT true,
  	"last_polled_at" timestamp(3) with time zone,
  	"etag" varchar,
  	"robots_ok" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "source_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_id" integer NOT NULL,
  	"external_id" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"summary" varchar,
  	"content_text" varchar,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lang" "enum_source_items_lang",
  	"cluster_id" integer,
  	"hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "story_clusters" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar NOT NULL,
  	"first_seen_at" timestamp(3) with time zone NOT NULL,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"item_count" numeric DEFAULT 1,
  	"distinct_sources" numeric DEFAULT 1,
  	"max_tier" numeric,
  	"status" "enum_story_clusters_status" DEFAULT 'new' NOT NULL,
  	"triage" jsonb,
  	"article_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "review_queue" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cluster_id" integer NOT NULL,
  	"article_id" integer,
  	"reason" varchar NOT NULL,
  	"flags" jsonb,
  	"telegram_message_id" varchar,
  	"decision" "enum_review_queue_decision",
  	"decided_by" varchar,
  	"decided_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"article_id" integer NOT NULL,
  	"platform" "enum_social_posts_platform" NOT NULL,
  	"format" "enum_social_posts_format" NOT NULL,
  	"copy" varchar NOT NULL,
  	"media_urls" jsonb,
  	"status" "enum_social_posts_status" DEFAULT 'queued' NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"posted_at" timestamp(3) with time zone,
  	"external_id" varchar,
  	"via" "enum_social_posts_via",
  	"idempotency_key" varchar NOT NULL,
  	"error" varchar,
  	"metrics" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"entity" varchar NOT NULL,
  	"entity_id" varchar NOT NULL,
  	"action" varchar NOT NULL,
  	"actor" varchar NOT NULL,
  	"payload" jsonb,
  	"at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "prompt_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" "enum_prompt_versions_key" NOT NULL,
  	"version" numeric NOT NULL,
  	"template" varchar NOT NULL,
  	"active" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "metrics_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"article_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"gsc_impressions" numeric,
  	"gsc_clicks" numeric,
  	"gsc_ctr" numeric,
  	"gsc_position" numeric,
  	"pageviews" numeric,
  	"fb_reach" numeric,
  	"ig_reach" numeric,
  	"x_impressions" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "push_subscriptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"endpoint" varchar NOT NULL,
  	"keys_p256dh" varchar NOT NULL,
  	"keys_auth" varchar NOT NULL,
  	"locale" "enum_push_subscriptions_locale",
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"articles_id" integer,
  	"categories_id" integer,
  	"tags_id" integer,
  	"authors_id" integer,
  	"pages_id" integer,
  	"data_pages_id" integer,
  	"data_points_id" integer,
  	"sources_id" integer,
  	"source_items_id" integer,
  	"story_clusters_id" integer,
  	"review_queue_id" integer,
  	"social_posts_id" integer,
  	"audit_log_id" integer,
  	"prompt_versions_id" integer,
  	"metrics_daily_id" integer,
  	"push_subscriptions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"thresholds_publish" numeric DEFAULT 0.72 NOT NULL,
  	"thresholds_review" numeric DEFAULT 0.5 NOT NULL,
  	"daily_caps_facebook" numeric DEFAULT 15,
  	"daily_caps_instagram" numeric DEFAULT 8,
  	"daily_caps_x" numeric DEFAULT 12,
  	"publish_window_start" varchar DEFAULT '00:00',
  	"publish_window_end" varchar DEFAULT '24:00',
  	"min_interval_min" numeric DEFAULT 20,
  	"active_models_triage" varchar DEFAULT 'ollama:qwen3:8b',
  	"active_models_write_en" varchar DEFAULT 'gemini:gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview',
  	"active_models_write_ur" varchar DEFAULT 'gemini:gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview',
  	"active_models_qa" varchar DEFAULT 'ollama:qwen3:8b',
  	"active_models_embed" varchar DEFAULT 'ollama:nomic-embed-text',
  	"kill_switch" boolean DEFAULT false,
  	"last_heartbeat" timestamp(3) with time zone,
  	"last_heartbeat_meta" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_title_variants" ADD CONSTRAINT "articles_title_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_key_points" ADD CONSTRAINT "articles_key_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_faqs" ADD CONSTRAINT "articles_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_sources" ADD CONSTRAINT "articles_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_embeds" ADD CONSTRAINT "articles_embeds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_updates" ADD CONSTRAINT "articles_updates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_corrections" ADD CONSTRAINT "articles_corrections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_corrections_locales" ADD CONSTRAINT "articles_corrections_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles_corrections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_story_cluster_id_story_clusters_id_fk" FOREIGN KEY ("story_cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_locales" ADD CONSTRAINT "articles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_title_variants" ADD CONSTRAINT "_articles_v_version_title_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_key_points" ADD CONSTRAINT "_articles_v_version_key_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_faqs" ADD CONSTRAINT "_articles_v_version_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_sources" ADD CONSTRAINT "_articles_v_version_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_embeds" ADD CONSTRAINT "_articles_v_version_embeds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_updates" ADD CONSTRAINT "_articles_v_version_updates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_corrections" ADD CONSTRAINT "_articles_v_version_corrections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_corrections_locales" ADD CONSTRAINT "_articles_v_version_corrections_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_version_corrections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_story_cluster_id_story_clusters_id_fk" FOREIGN KEY ("version_story_cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors_socials" ADD CONSTRAINT "authors_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors_locales" ADD CONSTRAINT "authors_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "data_pages_faqs" ADD CONSTRAINT "data_pages_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."data_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "data_pages_locales" ADD CONSTRAINT "data_pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."data_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "source_items" ADD CONSTRAINT "source_items_cluster_id_story_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_cluster_id_story_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_pages_fk" FOREIGN KEY ("data_pages_id") REFERENCES "public"."data_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_points_fk" FOREIGN KEY ("data_points_id") REFERENCES "public"."data_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_source_items_fk" FOREIGN KEY ("source_items_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_story_clusters_fk" FOREIGN KEY ("story_clusters_id") REFERENCES "public"."story_clusters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_review_queue_fk" FOREIGN KEY ("review_queue_id") REFERENCES "public"."review_queue"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_posts_fk" FOREIGN KEY ("social_posts_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_prompt_versions_fk" FOREIGN KEY ("prompt_versions_id") REFERENCES "public"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_metrics_daily_fk" FOREIGN KEY ("metrics_daily_id") REFERENCES "public"."metrics_daily"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_push_subscriptions_fk" FOREIGN KEY ("push_subscriptions_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumb_sizes_thumb_filename_idx" ON "media" USING btree ("sizes_thumb_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "media_sizes_square_sizes_square_filename_idx" ON "media" USING btree ("sizes_square_filename");
  CREATE INDEX "media_sizes_portrait_sizes_portrait_filename_idx" ON "media" USING btree ("sizes_portrait_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_title_variants_order_idx" ON "articles_title_variants" USING btree ("_order");
  CREATE INDEX "articles_title_variants_parent_id_idx" ON "articles_title_variants" USING btree ("_parent_id");
  CREATE INDEX "articles_title_variants_locale_idx" ON "articles_title_variants" USING btree ("_locale");
  CREATE INDEX "articles_key_points_order_idx" ON "articles_key_points" USING btree ("_order");
  CREATE INDEX "articles_key_points_parent_id_idx" ON "articles_key_points" USING btree ("_parent_id");
  CREATE INDEX "articles_key_points_locale_idx" ON "articles_key_points" USING btree ("_locale");
  CREATE INDEX "articles_faqs_order_idx" ON "articles_faqs" USING btree ("_order");
  CREATE INDEX "articles_faqs_parent_id_idx" ON "articles_faqs" USING btree ("_parent_id");
  CREATE INDEX "articles_faqs_locale_idx" ON "articles_faqs" USING btree ("_locale");
  CREATE INDEX "articles_sources_order_idx" ON "articles_sources" USING btree ("_order");
  CREATE INDEX "articles_sources_parent_id_idx" ON "articles_sources" USING btree ("_parent_id");
  CREATE INDEX "articles_embeds_order_idx" ON "articles_embeds" USING btree ("_order");
  CREATE INDEX "articles_embeds_parent_id_idx" ON "articles_embeds" USING btree ("_parent_id");
  CREATE INDEX "articles_updates_order_idx" ON "articles_updates" USING btree ("_order");
  CREATE INDEX "articles_updates_parent_id_idx" ON "articles_updates" USING btree ("_parent_id");
  CREATE INDEX "articles_corrections_order_idx" ON "articles_corrections" USING btree ("_order");
  CREATE INDEX "articles_corrections_parent_id_idx" ON "articles_corrections" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "articles_corrections_locales_locale_parent_id_unique" ON "articles_corrections_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category_id");
  CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author_id");
  CREATE INDEX "articles_hero_image_idx" ON "articles" USING btree ("hero_image_id");
  CREATE INDEX "articles_story_cluster_idx" ON "articles" USING btree ("story_cluster_id");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "articles_seo_seo_og_image_idx" ON "articles" USING btree ("seo_og_image_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_slug_idx" ON "articles_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "articles_locales_locale_parent_id_unique" ON "articles_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "_articles_v_version_title_variants_order_idx" ON "_articles_v_version_title_variants" USING btree ("_order");
  CREATE INDEX "_articles_v_version_title_variants_parent_id_idx" ON "_articles_v_version_title_variants" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_title_variants_locale_idx" ON "_articles_v_version_title_variants" USING btree ("_locale");
  CREATE INDEX "_articles_v_version_key_points_order_idx" ON "_articles_v_version_key_points" USING btree ("_order");
  CREATE INDEX "_articles_v_version_key_points_parent_id_idx" ON "_articles_v_version_key_points" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_key_points_locale_idx" ON "_articles_v_version_key_points" USING btree ("_locale");
  CREATE INDEX "_articles_v_version_faqs_order_idx" ON "_articles_v_version_faqs" USING btree ("_order");
  CREATE INDEX "_articles_v_version_faqs_parent_id_idx" ON "_articles_v_version_faqs" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_faqs_locale_idx" ON "_articles_v_version_faqs" USING btree ("_locale");
  CREATE INDEX "_articles_v_version_sources_order_idx" ON "_articles_v_version_sources" USING btree ("_order");
  CREATE INDEX "_articles_v_version_sources_parent_id_idx" ON "_articles_v_version_sources" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_embeds_order_idx" ON "_articles_v_version_embeds" USING btree ("_order");
  CREATE INDEX "_articles_v_version_embeds_parent_id_idx" ON "_articles_v_version_embeds" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_updates_order_idx" ON "_articles_v_version_updates" USING btree ("_order");
  CREATE INDEX "_articles_v_version_updates_parent_id_idx" ON "_articles_v_version_updates" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_corrections_order_idx" ON "_articles_v_version_corrections" USING btree ("_order");
  CREATE INDEX "_articles_v_version_corrections_parent_id_idx" ON "_articles_v_version_corrections" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_articles_v_version_corrections_locales_locale_parent_id_uni" ON "_articles_v_version_corrections_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_category_idx" ON "_articles_v" USING btree ("version_category_id");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_version_hero_image_idx" ON "_articles_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_articles_v_version_version_story_cluster_idx" ON "_articles_v" USING btree ("version_story_cluster_id");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_seo_version_seo_og_image_idx" ON "_articles_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_snapshot_idx" ON "_articles_v" USING btree ("snapshot");
  CREATE INDEX "_articles_v_published_locale_idx" ON "_articles_v" USING btree ("published_locale");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v_locales" USING btree ("version_slug","_locale");
  CREATE UNIQUE INDEX "_articles_v_locales_locale_parent_id_unique" ON "_articles_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_tags_id_idx" ON "_articles_v_rels" USING btree ("tags_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "authors_socials_order_idx" ON "authors_socials" USING btree ("_order");
  CREATE INDEX "authors_socials_parent_id_idx" ON "authors_socials" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_locales_locale_parent_id_unique" ON "authors_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "data_pages_faqs_order_idx" ON "data_pages_faqs" USING btree ("_order");
  CREATE INDEX "data_pages_faqs_parent_id_idx" ON "data_pages_faqs" USING btree ("_parent_id");
  CREATE INDEX "data_pages_faqs_locale_idx" ON "data_pages_faqs" USING btree ("_locale");
  CREATE UNIQUE INDEX "data_pages_key_idx" ON "data_pages" USING btree ("key");
  CREATE UNIQUE INDEX "data_pages_slug_idx" ON "data_pages" USING btree ("slug");
  CREATE INDEX "data_pages_created_at_idx" ON "data_pages" USING btree ("created_at");
  CREATE UNIQUE INDEX "data_pages_locales_locale_parent_id_unique" ON "data_pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "data_points_series_idx" ON "data_points" USING btree ("series");
  CREATE INDEX "data_points_city_idx" ON "data_points" USING btree ("city");
  CREATE INDEX "data_points_observed_at_idx" ON "data_points" USING btree ("observed_at");
  CREATE INDEX "data_points_updated_at_idx" ON "data_points" USING btree ("updated_at");
  CREATE INDEX "data_points_created_at_idx" ON "data_points" USING btree ("created_at");
  CREATE UNIQUE INDEX "sources_key_idx" ON "sources" USING btree ("key");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "source_items_source_idx" ON "source_items" USING btree ("source_id");
  CREATE INDEX "source_items_external_id_idx" ON "source_items" USING btree ("external_id");
  CREATE INDEX "source_items_cluster_idx" ON "source_items" USING btree ("cluster_id");
  CREATE INDEX "source_items_hash_idx" ON "source_items" USING btree ("hash");
  CREATE INDEX "source_items_updated_at_idx" ON "source_items" USING btree ("updated_at");
  CREATE INDEX "source_items_created_at_idx" ON "source_items" USING btree ("created_at");
  CREATE INDEX "story_clusters_article_idx" ON "story_clusters" USING btree ("article_id");
  CREATE INDEX "story_clusters_updated_at_idx" ON "story_clusters" USING btree ("updated_at");
  CREATE INDEX "story_clusters_created_at_idx" ON "story_clusters" USING btree ("created_at");
  CREATE INDEX "review_queue_cluster_idx" ON "review_queue" USING btree ("cluster_id");
  CREATE INDEX "review_queue_article_idx" ON "review_queue" USING btree ("article_id");
  CREATE INDEX "review_queue_updated_at_idx" ON "review_queue" USING btree ("updated_at");
  CREATE INDEX "review_queue_created_at_idx" ON "review_queue" USING btree ("created_at");
  CREATE INDEX "social_posts_article_idx" ON "social_posts" USING btree ("article_id");
  CREATE UNIQUE INDEX "social_posts_idempotency_key_idx" ON "social_posts" USING btree ("idempotency_key");
  CREATE INDEX "social_posts_updated_at_idx" ON "social_posts" USING btree ("updated_at");
  CREATE INDEX "social_posts_created_at_idx" ON "social_posts" USING btree ("created_at");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  CREATE INDEX "prompt_versions_updated_at_idx" ON "prompt_versions" USING btree ("updated_at");
  CREATE INDEX "prompt_versions_created_at_idx" ON "prompt_versions" USING btree ("created_at");
  CREATE INDEX "metrics_daily_article_idx" ON "metrics_daily" USING btree ("article_id");
  CREATE INDEX "metrics_daily_updated_at_idx" ON "metrics_daily" USING btree ("updated_at");
  CREATE INDEX "metrics_daily_created_at_idx" ON "metrics_daily" USING btree ("created_at");
  CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");
  CREATE INDEX "push_subscriptions_updated_at_idx" ON "push_subscriptions" USING btree ("updated_at");
  CREATE INDEX "push_subscriptions_created_at_idx" ON "push_subscriptions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_data_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("data_pages_id");
  CREATE INDEX "payload_locked_documents_rels_data_points_id_idx" ON "payload_locked_documents_rels" USING btree ("data_points_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_source_items_id_idx" ON "payload_locked_documents_rels" USING btree ("source_items_id");
  CREATE INDEX "payload_locked_documents_rels_story_clusters_id_idx" ON "payload_locked_documents_rels" USING btree ("story_clusters_id");
  CREATE INDEX "payload_locked_documents_rels_review_queue_id_idx" ON "payload_locked_documents_rels" USING btree ("review_queue_id");
  CREATE INDEX "payload_locked_documents_rels_social_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_posts_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_locked_documents_rels_prompt_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("prompt_versions_id");
  CREATE INDEX "payload_locked_documents_rels_metrics_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("metrics_daily_id");
  CREATE INDEX "payload_locked_documents_rels_push_subscriptions_id_idx" ON "payload_locked_documents_rels" USING btree ("push_subscriptions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "articles_title_variants" CASCADE;
  DROP TABLE "articles_key_points" CASCADE;
  DROP TABLE "articles_faqs" CASCADE;
  DROP TABLE "articles_sources" CASCADE;
  DROP TABLE "articles_embeds" CASCADE;
  DROP TABLE "articles_updates" CASCADE;
  DROP TABLE "articles_corrections" CASCADE;
  DROP TABLE "articles_corrections_locales" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_locales" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v_version_title_variants" CASCADE;
  DROP TABLE "_articles_v_version_key_points" CASCADE;
  DROP TABLE "_articles_v_version_faqs" CASCADE;
  DROP TABLE "_articles_v_version_sources" CASCADE;
  DROP TABLE "_articles_v_version_embeds" CASCADE;
  DROP TABLE "_articles_v_version_updates" CASCADE;
  DROP TABLE "_articles_v_version_corrections" CASCADE;
  DROP TABLE "_articles_v_version_corrections_locales" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_locales" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  DROP TABLE "authors_socials" CASCADE;
  DROP TABLE "authors" CASCADE;
  DROP TABLE "authors_locales" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "data_pages_faqs" CASCADE;
  DROP TABLE "data_pages" CASCADE;
  DROP TABLE "data_pages_locales" CASCADE;
  DROP TABLE "data_points" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "source_items" CASCADE;
  DROP TABLE "story_clusters" CASCADE;
  DROP TABLE "review_queue" CASCADE;
  DROP TABLE "social_posts" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "prompt_versions" CASCADE;
  DROP TABLE "metrics_daily" CASCADE;
  DROP TABLE "push_subscriptions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "settings" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_media_license";
  DROP TYPE "public"."enum_articles_embeds_type";
  DROP TYPE "public"."enum_articles_priority";
  DROP TYPE "public"."enum_articles_workflow";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_embeds_type";
  DROP TYPE "public"."enum__articles_v_version_priority";
  DROP TYPE "public"."enum__articles_v_version_workflow";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum__articles_v_published_locale";
  DROP TYPE "public"."enum_categories_slug";
  DROP TYPE "public"."enum_data_pages_key";
  DROP TYPE "public"."enum_data_points_series";
  DROP TYPE "public"."enum_sources_type";
  DROP TYPE "public"."enum_sources_language";
  DROP TYPE "public"."enum_source_items_lang";
  DROP TYPE "public"."enum_story_clusters_status";
  DROP TYPE "public"."enum_review_queue_decision";
  DROP TYPE "public"."enum_social_posts_platform";
  DROP TYPE "public"."enum_social_posts_format";
  DROP TYPE "public"."enum_social_posts_status";
  DROP TYPE "public"."enum_social_posts_via";
  DROP TYPE "public"."enum_prompt_versions_key";
  DROP TYPE "public"."enum_push_subscriptions_locale";`)
}
