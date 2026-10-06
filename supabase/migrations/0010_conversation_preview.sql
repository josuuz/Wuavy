-- Wuavy Pulse 0010: what a conversation's line in the list says. Run after 0009. Safe to run twice.
--
-- The list shows the latest exchange with the person (what they said, or what the clinic said)
-- and who spoke last, so "Aguardando resposta" holds even when the team adds an internal note
-- after the person wrote. A conversation with only notes shows its latest note. It still sorts
-- by its latest entry of any kind.

create or replace function pulse_conversation_touch(conversation uuid) returns void
language sql security definer set search_path = public as $$
  update conversations c set
    last_message_at = (select max(occurred_at) from conversation_messages where conversation_id = conversation),
    last_message_preview = m.preview,
    last_direction = m.direction
  from (
    select left(body, 160) as preview, direction from conversation_messages
    where conversation_id = conversation
    order by (direction = 'note'), occurred_at desc, created_at desc
    limit 1
  ) m
  where c.id = conversation;
$$;

revoke all on function pulse_conversation_touch(uuid) from public, anon, authenticated;

-- The conversations from before: their line again, by the same rule.
select pulse_conversation_touch(id) from conversations;
