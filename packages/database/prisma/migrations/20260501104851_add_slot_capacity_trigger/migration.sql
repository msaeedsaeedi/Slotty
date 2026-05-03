CREATE OR REPLACE FUNCTION check_slot_capacity()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  slot_capacity INTEGER;
BEGIN
  -- Only enforce when the resulting row has status 'booked'
  IF NEW.status <> 'booked' THEN
    RETURN NEW;
  END IF;

  -- If this is an UPDATE and status isn't changing to 'booked', skip
  IF TG_OP = 'UPDATE' AND OLD.status = 'booked' THEN
    RETURN NEW;
  END IF;

  SELECT capacity
    INTO slot_capacity
    FROM demo_slots
   WHERE id = NEW.slot_id;

  SELECT COUNT(*)
    INTO current_count
    FROM bookings
   WHERE slot_id = NEW.slot_id
     AND status = 'booked';

  IF current_count >= slot_capacity THEN
    RAISE EXCEPTION
      'Slot capacity exceeded: slot % already has %/% active bookings.',
      NEW.slot_id, current_count, slot_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER enforce_slot_capacity
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_slot_capacity();