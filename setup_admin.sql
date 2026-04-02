-- ==========================================
-- LA BÓVEDA - SETUP ADMIN & FEEDBACK SYSTEM
-- ==========================================

-- 1. Crear tabla de solicitudes de usuarios
CREATE TABLE IF NOT EXISTS public.user_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    type TEXT NOT NULL, -- 'bug', 'solicitud', 'otros'
    message TEXT NOT NULL,
    response TEXT,
    status TEXT DEFAULT 'pendiente', -- 'pendiente', 'resuelto'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS (Seguridad de Nivel de Fila)
ALTER TABLE public.user_requests ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Seguridad
-- Los usuarios pueden ver solo sus propias solicitudes
DO $$ BEGIN
    CREATE POLICY "Users can view their own requests" 
    ON public.user_requests FOR SELECT 
    USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Los usuarios pueden insertar sus propias solicitudes
DO $$ BEGIN
    CREATE POLICY "Users can insert their own requests" 
    ON public.user_requests FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- El Administrador tiene acceso total
DO $$ BEGIN
    CREATE POLICY "Admin can service all requests" 
    ON public.user_requests FOR ALL 
    USING (auth.jwt() ->> 'email' = 'vm.admin@laboveda.com');
EXCEPTION WHEN others THEN NULL; END $$;


-- 4. Función RPC para consolidar datos del Panel Admin
-- Esta función suma la inversión de todas las secciones por usuario.
CREATE OR REPLACE FUNCTION get_admin_dashboard_data()
RETURNS TABLE (
    u_id UUID,
    u_email TEXT,
    u_joined_at TIMESTAMPTZ,
    total_invested NUMERIC,
    total_profit NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Verificar si quien llama es el admin (opcional pero recomendado)
    IF (SELECT auth.jwt() ->> 'email') != 'vm.admin@laboveda.com' THEN
        RAISE EXCEPTION 'Acceso no autorizado';
    END IF;

    RETURN QUERY
    SELECT 
        u.id as u_id,
        u.email::TEXT as u_email,
        u.created_at as u_joined_at,
        -- Sumatoria de inversiones (CEDEARs + CRIPTO SPOT + ESTRATEGIAS)
        (
            COALESCE(cedear_totals.invested, 0) + 
            COALESCE(cripto_totals.invested, 0) + 
            COALESCE(strat_totals.invested, 0)
        )::NUMERIC as total_invested,
        -- Sumatoria de Profit Realizado (de estrategias pasadas)
        COALESCE(strat_totals.profit, 0)::NUMERIC as total_profit
    FROM 
        auth.users u
    LEFT JOIN (
        SELECT user_id, SUM(quantity * purchase_price) as invested 
        FROM public.cedears_purchases 
        GROUP BY user_id
    ) cedear_totals ON cedear_totals.user_id = u.id
    LEFT JOIN (
        SELECT user_id, SUM(quantity * purchase_price) as invested 
        FROM public.cripto_portfolio 
        GROUP BY user_id
    ) cripto_totals ON cripto_totals.user_id = u.id
    LEFT JOIN (
        SELECT 
            user_id, 
            SUM((op->>'invested')::numeric) as invested,
            SUM((op->>'profit')::numeric) as profit
        FROM public.cripto_strategies, jsonb_array_elements(past_operations) as op
        GROUP BY user_id
    ) strat_totals ON strat_totals.user_id = u.id
    WHERE u.email != 'vm.admin@laboveda.com' -- No mostrar al propio admin en las estadísticas
    ORDER BY total_invested DESC;
END;
$$;

-- 5. Otorgar permisos de ejecución al rol autenticado
GRANT EXECUTE ON FUNCTION get_admin_dashboard_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_data() TO service_role;
