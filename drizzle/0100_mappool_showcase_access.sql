CREATE TABLE "mappool_showcase_access" (
	"pool_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"approved_version" integer NOT NULL,
	"approved_lock_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mappool_showcase_access_pool_id_user_id_pk" PRIMARY KEY("pool_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "mappool_showcase_access" ADD CONSTRAINT "mappool_showcase_access_pool_id_mappools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."mappools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mappool_showcase_access" ADD CONSTRAINT "mappool_showcase_access_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;