import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Session } from '@supabase/supabase-js';

export function useUserRole(session: Session | null) {
    const [role, setRole] = useState<'admin' | 'user'>('user');
    const [name, setName] = useState<string>('Usuario');
    const [loadingRole, setLoadingRole] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function fetchUserRole() {
            if (!session?.user?.id) {
                if (isMounted) {
                    setRole('user');
                    setName('Usuario');
                    setLoadingRole(false);
                }
                return;
            }

            setLoadingRole(true);

            try {
                const { data, error } = await supabase
                    .from('perfiles')
                    .select('rol, nombre')
                    .eq('id', session.user.id)
                    .single();

                if (error) {
                    console.error('Error fetching user role:', error);
                    if (isMounted) setRole('user');
                } else if (data) {
                    if (isMounted) {
                        // Validar que el rol sea uno de los tipos permitidos, fallback a 'user'
                        const fetchedRole = data.rol === 'admin' ? 'admin' : 'user';
                        console.log('Rol obtenido desde Supabase para el usuario:', fetchedRole);
                        setRole(fetchedRole);
                        if (data.nombre) setName(data.nombre);
                    }
                }
            } catch (err) {
                console.error('Unexpected error fetching user profile:', err);
            } finally {
                if (isMounted) setLoadingRole(false);
            }
        }

        fetchUserRole();

        return () => {
            isMounted = false;
        };
    }, [session]);

    return { role, name, loadingRole };
}
