CREATE OR REPLACE FUNCTION get_random_questions_for_lesson(p_lesson_id UUID, p_limit INT)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id
  FROM public.questions q
  WHERE q.lesson_id = p_lesson_id
  ORDER BY RANDOM()
  LIMIT p_limit;
END;
$$;
