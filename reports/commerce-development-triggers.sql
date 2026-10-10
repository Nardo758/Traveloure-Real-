-- DEVELOPMENT ARCHIVE ONLY — NOT A MIGRATION; DO NOT REGISTER OR EXECUTE.
-- 15 approved trigger instances; backing functions are archived but NOT approved for deletion.
-- Preserves observed function definitions and trigger enable states.

CREATE OR REPLACE FUNCTION public.commerce_catalog_observer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE old_data jsonb; data jsonb; subject text; subject_type text; slot text;
 old_amount numeric; amount numeric; cur text; old_cur text; label text; city text;
 was_visible boolean; visible boolean; same_basis boolean; details jsonb;
BEGIN
 data:=to_jsonb(NEW); old_data:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 subject:=data->>'id'; subject_type:='service'; slot:=NULL;
 IF TG_TABLE_NAME='vendor_availability_slots' THEN
   subject:=data->>'service_id'; slot:=data->>'id';
   IF TG_OP='UPDATE' AND
     (COALESCE((old_data->>'booked_count')::int,0)<COALESCE((old_data->>'capacity')::int,1) AND old_data->>'status'='available')
     AND ((data->>'booked_count')::int >= (data->>'capacity')::int OR data->>'status'<>'available') THEN
     INSERT INTO commerce_catalog_events(id,source_table,subject_type,subject_id,slot_id,event_kind,comparable,payload,observed_at)
       SELECT gen_random_uuid()::text,TG_TABLE_NAME,'service',subject,slot,'sold_out',false,
         jsonb_build_object('label',service_name,'city',location,'aliases',jsonb_build_array(id,'service-'||id)),NOW()
       FROM provider_services WHERE id=subject;
   END IF;
   RETURN NEW;
 ELSIF TG_TABLE_NAME='provider_services' THEN
   -- Existing platform checkout prices provider_services in USD; no currency column is invented.
   cur:='USD'; old_cur:='USD'; label:=data->>'service_name'; city:=data->>'location';
   visible:=data->>'approval_status'='approved' AND data->>'status'='active';
   was_visible:=old_data->>'approval_status'='approved' AND old_data->>'status'='active';
   same_basis:=ROW(data->>'price_type',data->>'price_based_on',data->>'pricing_unit',data->'pricing_tiers')
     IS NOT DISTINCT FROM ROW(old_data->>'price_type',old_data->>'price_based_on',old_data->>'pricing_unit',old_data->'pricing_tiers');
 ELSIF TG_TABLE_NAME='activity_cache' THEN
   subject_type:='activity'; cur:=data->>'currency'; old_cur:=old_data->>'currency';
   label:=data->>'title'; city:=COALESCE(data->>'city',data->>'destination');
   visible:=true; was_visible:=TG_OP='UPDATE'; same_basis:=true;
 ELSE
   subject_type:='affiliate_product'; cur:=data->>'currency'; old_cur:=old_data->>'currency';
   label:=data->>'name'; city:=COALESCE(data->>'city',data->>'location');
   visible:=(data->>'is_active')::boolean IS TRUE;
   was_visible:=(old_data->>'is_active')::boolean IS TRUE; same_basis:=true;
 END IF;
 old_amount:=(old_data->>'price')::numeric; amount:=(data->>'price')::numeric;
 details:=jsonb_build_object('label',label,'city',city,'description',data->>'description',
   'visible',visible,'aliases',jsonb_build_array(subject,
     CASE WHEN subject_type='service' THEN 'service-'||subject WHEN subject_type='activity' THEN 'activity-'||subject ELSE subject END,
     data->>'product_code',CASE WHEN data->>'product_code' IS NOT NULL THEN 'activity-'||(data->>'product_code') END));
 IF TG_OP='UPDATE' AND was_visible IS TRUE AND visible IS NOT TRUE THEN
   INSERT INTO commerce_catalog_events(id,source_table,subject_type,subject_id,event_kind,comparable,payload,observed_at)
     VALUES(gen_random_uuid()::text,TG_TABLE_NAME,subject_type,subject,'sold_out',false,details,NOW());
 ELSIF TG_OP='UPDATE' AND was_visible IS TRUE AND
   (old_amount IS DISTINCT FROM amount OR cur IS DISTINCT FROM old_cur OR same_basis IS NOT TRUE) THEN
   INSERT INTO commerce_catalog_events(id,source_table,subject_type,subject_id,event_kind,old_price,new_price,currency,comparable,payload,observed_at)
     VALUES(gen_random_uuid()::text,TG_TABLE_NAME,subject_type,subject,'price_changed',old_amount,amount,cur,
       visible IS TRUE AND cur IS NOT NULL AND cur=old_cur AND same_basis IS TRUE,details,NOW());
 END IF;
 IF visible IS TRUE AND (was_visible IS NOT TRUE OR
   ROW(old_data->>'service_name',old_data->>'title',old_data->>'name',old_data->>'location',old_data->>'city',old_data->>'description')
   IS DISTINCT FROM ROW(data->>'service_name',data->>'title',data->>'name',data->>'location',data->>'city',data->>'description')) THEN
   INSERT INTO commerce_catalog_events(id,source_table,subject_type,subject_id,event_kind,new_price,currency,comparable,payload,observed_at)
     VALUES(gen_random_uuid()::text,TG_TABLE_NAME,subject_type,subject,'published',amount,cur,false,details,NOW());
 END IF;
 RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_booking_started()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor text;
BEGIN
 actor:=COALESCE(to_jsonb(NEW)->>'traveler_id',to_jsonb(NEW)->>'user_id');
 IF TG_TABLE_NAME='coordination_bookings' THEN
   SELECT user_id INTO actor FROM coordination_states WHERE id=NEW.coordination_id;
 END IF;
 IF actor IS NULL OR COALESCE(to_jsonb(NEW)->>'status','pending')
   IN('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed') THEN RETURN NEW; END IF;
 PERFORM id FROM users WHERE id=actor FOR UPDATE;
 UPDATE commerce_carts SET state='payment_started' WHERE user_id=actor AND state IN('active','abandoned');
 UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Booking or payment started',updated_at=NOW()
 WHERE metadata->>'commerceVersion'='1' AND metadata->>'travelerId'=actor
   AND email_type IN('cart_reminder_1h','cart_reminder_1d','cart_reminder_3d')
   AND status IN('pending','failed','processing');
 RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_cart_activity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor text; trip text; slug text; key text; cart text; previous_key text;
BEGIN
 actor := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 IF actor IS NULL THEN RETURN NULL; END IF; -- real guest rail is browser-local, never emailable
 PERFORM id FROM users WHERE id=actor FOR UPDATE;
 IF TG_OP='UPDATE' AND
   ROW(OLD.user_id,OLD.trip_id,OLD.experience_slug,OLD.quantity,OLD.scheduled_date,
       OLD.slot_id,OLD.notes,OLD.party_size,OLD.pickup_location) IS NOT DISTINCT FROM
   ROW(NEW.user_id,NEW.trip_id,NEW.experience_slug,NEW.quantity,NEW.scheduled_date,
       NEW.slot_id,NEW.notes,NEW.party_size,NEW.pickup_location) THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN
   previous_key := jsonb_build_array(OLD.trip_id,OLD.experience_slug)::text;
   IF NOT EXISTS(SELECT 1 FROM cart_items c WHERE c.user_id=OLD.user_id
     AND jsonb_build_array(c.trip_id,c.experience_slug)::text=previous_key) THEN
     UPDATE commerce_carts SET state='empty' WHERE user_id=OLD.user_id AND group_key=previous_key;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN
   trip:=OLD.trip_id; slug:=OLD.experience_slug;
 ELSE
   trip:=NEW.trip_id; slug:=NEW.experience_slug;
   -- FK cleanup on deleted trips is not a new human activity or cart sequence.
   IF TG_OP='UPDATE' AND OLD.trip_id IS NOT NULL AND NEW.trip_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM trips WHERE id=OLD.trip_id) THEN RETURN NULL; END IF;
 END IF;
 key:=jsonb_build_array(trip,slug)::text;
 IF EXISTS(SELECT 1 FROM cart_items c WHERE c.user_id=actor
   AND jsonb_build_array(c.trip_id,c.experience_slug)::text=key) THEN
   INSERT INTO commerce_carts(id,user_id,group_key,trip_id,experience_slug,sequence_id,state,last_activity_at,created_at)
     VALUES(gen_random_uuid()::text,actor,key,trip,slug,gen_random_uuid()::text,'active',NOW(),NOW())
   ON CONFLICT(user_id,group_key) DO UPDATE SET
     sequence_id=CASE WHEN commerce_carts.state='payment_started' THEN commerce_carts.sequence_id ELSE gen_random_uuid()::text END,
     state=CASE WHEN commerce_carts.state='payment_started' THEN 'payment_started' ELSE 'active' END,
     last_activity_at=NOW(),abandoned_at=NULL
   RETURNING id INTO cart;
 END IF;
 -- Both moved-from and current groups physically lose their old reminder sequence.
 UPDATE email_outbox o SET status='cancelled',retry_after=NULL,last_error='Cart activity or deletion',updated_at=NOW()
 WHERE o.metadata->>'commerceVersion'='1' AND o.email_type IN ('cart_reminder_1h','cart_reminder_1d','cart_reminder_3d')
 AND o.status IN ('pending','failed','processing') AND o.metadata->>'cartId' IN
   (SELECT id FROM commerce_carts WHERE user_id=actor AND group_key IN(key,previous_key));
 UPDATE email_outbox o SET status='cancelled',retry_after=NULL,last_error='Cart emptied',updated_at=NOW()
 WHERE o.metadata->>'commerceVersion'='1' AND o.status IN('pending','failed','processing')
 AND o.metadata->>'cartId' IN (SELECT id FROM commerce_carts WHERE user_id=actor AND state='empty');
 RETURN NULL;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_cancel_deleted_cart()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Cart/account removed',updated_at=NOW()
 WHERE metadata->>'cartId'=OLD.id AND status IN('pending','failed','processing');
 RETURN OLD;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_queue_cart_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE c record; actor record; zone text;
BEGIN
 IF NEW.event_kind NOT IN('price_changed','sold_out') THEN RETURN NEW; END IF;
 FOR c IN SELECT DISTINCT cc.* FROM commerce_carts cc JOIN cart_items ci ON ci.user_id=cc.user_id
   AND jsonb_build_array(ci.trip_id,ci.experience_slug)::text=cc.group_key
   WHERE cc.state NOT IN('empty') AND
   ((NEW.subject_type='service' AND ci.service_id=NEW.subject_id
     AND (NEW.slot_id IS NULL OR ci.slot_id=NEW.slot_id))
    OR (ci.content_type=NEW.subject_type AND (ci.content_id=NEW.subject_id
      OR NEW.payload->'aliases' ? ci.content_id)))
   ORDER BY cc.user_id,cc.id
 LOOP
   SELECT * INTO actor FROM users WHERE id=c.user_id FOR UPDATE;
   IF actor.email IS NULL OR actor.is_deleted IS TRUE OR actor.is_suspended IS TRUE THEN CONTINUE; END IF;
   UPDATE commerce_carts SET last_change_at=NEW.observed_at WHERE id=c.id;
   SELECT name INTO zone FROM pg_timezone_names WHERE name=COALESCE(
     actor.preferences->'marketingDelivery'->>'timeZone',actor.preferences->'commerceMarketing'->>'timeZone',
     actor.preferences->'itineraryMarketing'->>'timeZone') LIMIT 1;
   IF zone IS NOT NULL THEN
     UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Cart item changed on reminder day',updated_at=NOW()
     WHERE metadata->>'cartId'=c.id AND email_type IN('cart_reminder_1h','cart_reminder_1d','cart_reminder_3d')
       AND status IN('pending','failed','processing')
       AND ((metadata->>'dueAt')::timestamptz AT TIME ZONE zone)::date <= (NEW.observed_at AT TIME ZONE zone)::date;
   END IF;
   INSERT INTO email_outbox(email_type,to_email,subject,html,text_body,status,retry_after,metadata)
     VALUES('cart_item_changed',actor.email,'An item in your cart changed','<p>Review your cart.</p>',
       'Review your cart.','pending',NOW(),jsonb_build_object(
       'commerceVersion',1,'commerceKey','cart-change:'||c.id||':'||NEW.id,'travelerId',c.user_id,
       'cartId',c.id,'eventId',NEW.id,'marketing',false))
     ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_remove_saved_item()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 PERFORM id FROM users WHERE id=OLD.user_id FOR UPDATE;
 UPDATE email_outbox o SET metadata=jsonb_set(o.metadata,'{savedItemId}',to_jsonb(replacement.id))
 FROM commerce_catalog_events e, saved_items replacement
 WHERE o.metadata->>'eventId'=e.id AND o.metadata->>'savedItemId'=OLD.id
   AND o.email_type='wishlist_price_drop' AND o.status IN('pending','failed','processing')
   AND replacement.id<>OLD.id AND replacement.user_id=OLD.user_id AND replacement.created_at<=e.observed_at
   AND (replacement.content_id=e.subject_id OR e.payload->'aliases' ? replacement.content_id)
   AND (replacement.content_type=e.subject_type OR
     (e.subject_type='affiliate_product' AND replacement.content_type IN('activity','service')));
 UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Saved item removed',updated_at=NOW()
 WHERE metadata->>'savedItemId'=OLD.id AND email_type='wishlist_price_drop' AND status IN('pending','failed','processing');
 RETURN OLD;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_trip_removed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 UPDATE commerce_carts SET state='empty' WHERE trip_id=OLD.id;
 UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Trip removed',updated_at=NOW()
 WHERE status IN('pending','failed','processing') AND metadata->>'cartId' IN(SELECT id FROM commerce_carts WHERE trip_id=OLD.id);
 RETURN OLD;
END $function$


CREATE OR REPLACE FUNCTION public.commerce_account_removed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE remove_it boolean;
BEGIN
 remove_it:=TG_OP='DELETE';
 IF TG_OP<>'DELETE' THEN remove_it:=NEW.is_deleted IS TRUE OR NEW.is_suspended IS TRUE OR OLD.email IS DISTINCT FROM NEW.email; END IF;
 IF remove_it THEN
   UPDATE email_outbox SET status='cancelled',retry_after=NULL,last_error='Account or recipient changed',updated_at=NOW()
   WHERE metadata->>'commerceVersion'='1' AND metadata->>'travelerId'=OLD.id AND status IN('pending','failed','processing');
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$


-- public.activity_cache; tgenabled=O
CREATE TRIGGER commerce_price_observer AFTER INSERT OR UPDATE ON activity_cache FOR EACH ROW EXECUTE FUNCTION commerce_catalog_observer();

-- public.affiliate_booking_requests; tgenabled=O
CREATE TRIGGER commerce_booking_guard BEFORE INSERT OR UPDATE ON affiliate_booking_requests FOR EACH ROW EXECUTE FUNCTION commerce_booking_started();

-- public.affiliate_products; tgenabled=O
CREATE TRIGGER commerce_price_observer AFTER INSERT OR UPDATE ON affiliate_products FOR EACH ROW EXECUTE FUNCTION commerce_catalog_observer();

-- public.bookings; tgenabled=O
CREATE TRIGGER commerce_booking_guard BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION commerce_booking_started();

-- public.cart_items; tgenabled=O
CREATE TRIGGER commerce_cart_activity_guard AFTER INSERT OR DELETE OR UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION commerce_cart_activity();

-- public.commerce_carts; tgenabled=O
CREATE TRIGGER commerce_cart_delete_guard BEFORE DELETE ON commerce_carts FOR EACH ROW EXECUTE FUNCTION commerce_cancel_deleted_cart();

-- public.commerce_catalog_events; tgenabled=O
CREATE TRIGGER commerce_catalog_cart_changes AFTER INSERT ON commerce_catalog_events FOR EACH ROW EXECUTE FUNCTION commerce_queue_cart_changes();

-- public.coordination_bookings; tgenabled=O
CREATE TRIGGER commerce_booking_guard BEFORE INSERT OR UPDATE ON coordination_bookings FOR EACH ROW EXECUTE FUNCTION commerce_booking_started();

-- public.provider_services; tgenabled=O
CREATE TRIGGER commerce_price_observer AFTER INSERT OR UPDATE ON provider_services FOR EACH ROW EXECUTE FUNCTION commerce_catalog_observer();

-- public.saved_items; tgenabled=O
CREATE TRIGGER commerce_saved_item_delete BEFORE DELETE ON saved_items FOR EACH ROW EXECUTE FUNCTION commerce_remove_saved_item();

-- public.service_bookings; tgenabled=O
CREATE TRIGGER commerce_booking_guard BEFORE INSERT OR UPDATE ON service_bookings FOR EACH ROW EXECUTE FUNCTION commerce_booking_started();

-- public.trips; tgenabled=O
CREATE TRIGGER commerce_trip_delete BEFORE DELETE ON trips FOR EACH ROW EXECUTE FUNCTION commerce_trip_removed();

-- public.users; tgenabled=O
CREATE TRIGGER commerce_account_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION commerce_account_removed();

-- public.users; tgenabled=O
CREATE TRIGGER commerce_account_update BEFORE UPDATE OF email, is_deleted, is_suspended ON users FOR EACH ROW EXECUTE FUNCTION commerce_account_removed();

-- public.vendor_availability_slots; tgenabled=O
CREATE TRIGGER commerce_stock_observer AFTER INSERT OR UPDATE ON vendor_availability_slots FOR EACH ROW EXECUTE FUNCTION commerce_catalog_observer();
