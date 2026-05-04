export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole =
  | 'Admin'
  | 'Head Comercial'
  | 'Gerente de Contas'
  | 'Closer'
  | 'SDR'
  | 'Colaborador'

export type ActivationChannel = 'Inbound' | 'Outbound' | 'Indicação'
export type FormType           = 'Cadastro' | 'Pesquisa' | 'Indicação' | 'Qualificação' | 'Premiação' | 'Contrato'
export type FormStatus         = 'Publicado' | 'Arquivado' | 'Rascunho'
export type PaymentStatus      = 'Pendente' | 'Pago' | 'Cancelado'
export type CallStatus         = 'Agendada' | 'Realizada' | 'Cancelada' | 'No-show'
export type AwardStatus        = 'Pendente' | 'Em Trânsito' | 'Enviado' | 'Entregue' | 'Cancelado'

export interface Database {
  public: {
    Tables: {
      teams: {
        Row:    { id: string; name: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; updated_at?: string }
        Relationships: []
      }

      users: {
        Row: {
          id: string; name: string; email: string; role: UserRole
          team_id: string | null; active: boolean; setor: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; name: string; email: string; role?: UserRole
          team_id?: string | null; active?: boolean; setor?: string | null; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; name?: string; email?: string; role?: UserRole
          team_id?: string | null; active?: boolean; setor?: string | null; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'users_team_id_fkey'; columns: ['team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] }
        ]
      }

      activations: {
        Row: {
          id: string; client: string; email: string | null; phone: string | null
          channel: ActivationChannel; responsible: string; date: string; time: string | null
          sdr_id: string | null; sdr_nome: string | null; sem_sdr: boolean
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; client: string; email?: string | null; phone?: string | null
          channel: ActivationChannel; responsible: string; date: string; time?: string | null
          sdr_id?: string | null; sdr_nome?: string | null; sem_sdr?: boolean
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; client?: string; email?: string | null; phone?: string | null
          channel?: ActivationChannel; responsible?: string; date?: string; time?: string | null
          sdr_id?: string | null; sdr_nome?: string | null; sem_sdr?: boolean
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'activations_responsible_fkey'; columns: ['responsible']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'activations_sdr_id_fkey'; columns: ['sdr_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }

      webhook_logs: {
        Row: {
          id: string; ativacao_id: string | null; payload: Json
          status: string; tentativas: number; erro: string | null; created_at: string
        }
        Insert: {
          id?: string; ativacao_id?: string | null; payload: Json
          status?: string; tentativas?: number; erro?: string | null; created_at?: string
        }
        Update: {
          status?: string; tentativas?: number; erro?: string | null
        }
        Relationships: [
          { foreignKeyName: 'webhook_logs_ativacao_id_fkey'; columns: ['ativacao_id']; isOneToOne: false; referencedRelation: 'activations'; referencedColumns: ['id'] }
        ]
      }

      forms: {
        Row: {
          id: string; name: string; type: FormType; slug: string; responses: number
          active: boolean; color: string; status: FormStatus; fields: Json
          embed_code: string; webhook: string; custom_domain: string; background_image: string
          bg_color: string; field_bg_color: string; field_text_color: string; bg_opacity: number; redirect_url: string
          logo_url: string; logo_width: number; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; name: string; type: FormType; slug: string; responses?: number
          active?: boolean; color?: string; status?: FormStatus; fields?: Json
          embed_code?: string; webhook?: string; custom_domain?: string; background_image?: string
          bg_color?: string; field_bg_color?: string; field_text_color?: string; bg_opacity?: number; redirect_url?: string
          logo_url?: string; logo_width?: number; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; name?: string; type?: FormType; slug?: string; responses?: number
          active?: boolean; color?: string; status?: FormStatus; fields?: Json
          embed_code?: string; webhook?: string; custom_domain?: string; background_image?: string
          bg_color?: string; field_bg_color?: string; field_text_color?: string; bg_opacity?: number; redirect_url?: string
          logo_url?: string; logo_width?: number; updated_at?: string
        }
        Relationships: []
      }

      form_submissions: {
        Row: {
          id: string; form_id: string; data: Json; submitted_at: string; status: string
          tracking_code: string; carrier: string; me_cart_id: string
        }
        Insert: {
          id?: string; form_id: string; data?: Json; submitted_at?: string; status?: string
          tracking_code?: string; carrier?: string; me_cart_id?: string
        }
        Update: {
          id?: string; form_id?: string; data?: Json; submitted_at?: string; status?: string
          tracking_code?: string; carrier?: string; me_cart_id?: string
        }
        Relationships: [
          { foreignKeyName: 'form_submissions_form_id_fkey'; columns: ['form_id']; isOneToOne: false; referencedRelation: 'forms'; referencedColumns: ['id'] }
        ]
      }

      payments: {
        Row: {
          id: string; user_id: string; value: number; ref: string; status: PaymentStatus
          nf: boolean; date: string; notes: string; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; user_id: string; value: number; ref: string; status?: PaymentStatus
          nf?: boolean; date: string; notes?: string; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; user_id?: string; value?: number; ref?: string; status?: PaymentStatus
          nf?: boolean; date?: string; notes?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'payments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }

      audit_logs: {
        Row: {
          id: string; user_id: string | null; user_name: string
          action: string; module: string; created_at: string
        }
        Insert: {
          id?: string; user_id?: string | null; user_name: string
          action: string; module: string; created_at?: string
        }
        Update: {
          id?: string; user_id?: string | null; user_name?: string
          action?: string; module?: string
        }
        Relationships: [
          { foreignKeyName: 'audit_logs_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }

      calls: {
        Row: {
          id: string; title: string; date: string; time: string
          responsible: string; status: CallStatus; notes: string
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; title: string; date: string; time: string
          responsible: string; status?: CallStatus; notes?: string
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; title?: string; date?: string; time?: string
          responsible?: string; status?: CallStatus; notes?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'calls_responsible_fkey'; columns: ['responsible']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }

      inventory: {
        Row: {
          id: string; name: string; category: string; qty: number; unit: string
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; name: string; category?: string; qty?: number; unit?: string
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; name?: string; category?: string; qty?: number; unit?: string; updated_at?: string
        }
        Relationships: []
      }

      awards: {
        Row: {
          id: string; client: string; award: string; status: AwardStatus
          date: string; tracking: string; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; client: string; award: string; status?: AwardStatus
          date: string; tracking?: string; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; client?: string; award?: string; status?: AwardStatus
          date?: string; tracking?: string; updated_at?: string
        }
        Relationships: []
      }
    }

    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role:          UserRole  // includes 'Colaborador'
      activation_channel: ActivationChannel
      form_type:          FormType
      form_status:        FormStatus
      payment_status:     PaymentStatus
      call_status:        CallStatus
      award_status:       AwardStatus
    }
  }
}
