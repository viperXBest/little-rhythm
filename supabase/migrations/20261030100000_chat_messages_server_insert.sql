-- Day 7: every chat message is written by the chat function. A client insert
-- would skip the health gate: a health question stored ungated would reach the
-- model as history, the summary and search on later turns. The function stores
-- the parent's message with the service role only after checkThread, and gated
-- as the gate decided. Clients keep read access through chat_messages_select.

drop policy chat_messages_insert on public.chat_messages;
revoke insert on public.chat_messages from authenticated;
