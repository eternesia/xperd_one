export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acc_journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          entry_no: string
          id: string
          is_auto: boolean
          memo: string | null
          source_doc_number: string | null
          source_id: string | null
          source_type: string | null
          total_credit: number
          total_debit: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no: string
          id?: string
          is_auto?: boolean
          memo?: string | null
          source_doc_number?: string | null
          source_id?: string | null
          source_type?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          is_auto?: boolean
          memo?: string | null
          source_doc_number?: string | null
          source_id?: string | null
          source_type?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acc_journal_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      acc_journal_lines: {
        Row: {
          account_code: string
          account_name: string | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          line_no: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_code: string
          account_name?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          line_no?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_code?: string
          account_name?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_no?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acc_journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "acc_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acc_journal_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body_en: string | null
          body_id: string | null
          created_at: string
          ends_at: string | null
          id: string
          is_published: boolean
          severity: string
          starts_at: string
          title_en: string
          title_id: string | null
          updated_at: string
        }
        Insert: {
          audience?: string
          body_en?: string | null
          body_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          is_published?: boolean
          severity?: string
          starts_at?: string
          title_en: string
          title_id?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string
          body_en?: string | null
          body_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          is_published?: boolean
          severity?: string
          starts_at?: string
          title_en?: string
          title_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          password_hash: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      cb_accounts: {
        Row: {
          account_kind: string
          account_number: string | null
          bank_name: string | null
          code: string
          created_at: string
          currency: string
          gl_account_code: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_kind?: string
          account_number?: string | null
          bank_name?: string | null
          code: string
          created_at?: string
          currency?: string
          gl_account_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_kind?: string
          account_number?: string | null
          bank_name?: string | null
          code?: string
          created_at?: string
          currency?: string
          gl_account_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_transactions: {
        Row: {
          account_code: string
          account_name: string | null
          amount: number
          category_account_code: string | null
          category_account_name: string | null
          contact_name: string | null
          counterpart_account_code: string | null
          counterpart_account_name: string | null
          created_at: string
          created_by: string | null
          id: string
          is_reconciled: boolean
          journal_entry_id: string | null
          memo: string | null
          method: string
          reconciled_at: string | null
          reference: string | null
          trx_date: string
          trx_no: string
          trx_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_code: string
          account_name?: string | null
          amount?: number
          category_account_code?: string | null
          category_account_name?: string | null
          contact_name?: string | null
          counterpart_account_code?: string | null
          counterpart_account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_reconciled?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          method?: string
          reconciled_at?: string | null
          reference?: string | null
          trx_date?: string
          trx_no: string
          trx_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_code?: string
          account_name?: string | null
          amount?: number
          category_account_code?: string | null
          category_account_name?: string | null
          contact_name?: string | null
          counterpart_account_code?: string | null
          counterpart_account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_reconciled?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          method?: string
          reconciled_at?: string | null
          reference?: string | null
          trx_date?: string
          trx_no?: string
          trx_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_assets: {
        Row: {
          accum_account_code: string | null
          accumulated_depreciation: number
          acquisition_cost: number
          acquisition_date: string
          asset_account_code: string | null
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          disposal_amount: number | null
          disposal_date: string | null
          expense_account_code: string | null
          id: string
          location: string | null
          method: string
          name: string
          notes: string | null
          salvage_value: number
          status: string
          updated_at: string
          useful_life_months: number
          workspace_id: string
        }
        Insert: {
          accum_account_code?: string | null
          accumulated_depreciation?: number
          acquisition_cost?: number
          acquisition_date?: string
          asset_account_code?: string | null
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          expense_account_code?: string | null
          id?: string
          location?: string | null
          method?: string
          name: string
          notes?: string | null
          salvage_value?: number
          status?: string
          updated_at?: string
          useful_life_months?: number
          workspace_id: string
        }
        Update: {
          accum_account_code?: string | null
          accumulated_depreciation?: number
          acquisition_cost?: number
          acquisition_date?: string
          asset_account_code?: string | null
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          expense_account_code?: string | null
          id?: string
          location?: string | null
          method?: string
          name?: string
          notes?: string | null
          salvage_value?: number
          status?: string
          updated_at?: string
          useful_life_months?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fa_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_depreciations: {
        Row: {
          amount: number
          asset_code: string | null
          asset_id: string
          asset_name: string | null
          book_value_after: number
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          period_date: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          asset_code?: string | null
          asset_id: string
          asset_name?: string | null
          book_value_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          period_date: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          asset_code?: string | null
          asset_id?: string
          asset_name?: string | null
          book_value_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          period_date?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fa_depreciations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fa_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_depreciations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_movements: {
        Row: {
          counterpart_warehouse_code: string | null
          created_at: string
          created_by: string | null
          id: string
          item_code: string
          item_name: string | null
          movement_date: string
          movement_type: string
          notes: string | null
          qty: number
          ref_id: string | null
          ref_number: string | null
          ref_type: string | null
          unit_cost: number
          uom_code: string | null
          updated_at: string
          value: number
          warehouse_code: string | null
          workspace_id: string
        }
        Insert: {
          counterpart_warehouse_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_code: string
          item_name?: string | null
          movement_date?: string
          movement_type: string
          notes?: string | null
          qty?: number
          ref_id?: string | null
          ref_number?: string | null
          ref_type?: string | null
          unit_cost?: number
          uom_code?: string | null
          updated_at?: string
          value?: number
          warehouse_code?: string | null
          workspace_id: string
        }
        Update: {
          counterpart_warehouse_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_code?: string
          item_name?: string | null
          movement_date?: string
          movement_type?: string
          notes?: string | null
          qty?: number
          ref_id?: string | null
          ref_number?: string | null
          ref_type?: string | null
          unit_cost?: number
          uom_code?: string | null
          updated_at?: string
          value?: number
          warehouse_code?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          auto_reminder: boolean
          created_at: string
          due_date: string
          gateway_reference: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string | null
          subtotal: number
          tax_amount: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          auto_reminder?: boolean
          created_at?: string
          due_date?: string
          gateway_reference?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          auto_reminder?: boolean
          created_at?: string
          due_date?: string
          gateway_reference?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string
          contact_name: string
          created_at: string
          email: string
          employee_range: string | null
          id: string
          industry: string | null
          interested_product: Database["public"]["Enums"]["product_line"]
          job_title: string | null
          message: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          employee_range?: string | null
          id?: string
          industry?: string | null
          interested_product?: Database["public"]["Enums"]["product_line"]
          job_title?: string | null
          message?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          employee_range?: string | null
          id?: string
          industry?: string | null
          interested_product?: Database["public"]["Enums"]["product_line"]
          job_title?: string | null
          message?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      md_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["md_account_type"]
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["md_account_type"]
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["md_account_type"]
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_customers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          contact_name: string | null
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          tax_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_items: {
        Row: {
          barcode: string | null
          category_code: string | null
          code: string
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          item_type: Database["public"]["Enums"]["md_item_type"]
          min_stock: number
          name: string
          sell_price: number
          uom_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          barcode?: string | null
          category_code?: string | null
          code: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["md_item_type"]
          min_stock?: number
          name: string
          sell_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          barcode?: string | null
          category_code?: string | null
          code?: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["md_item_type"]
          min_stock?: number
          name?: string
          sell_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_suppliers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          payment_terms: number
          phone: string | null
          tax_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          payment_terms?: number
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          payment_terms?: number
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_taxes: {
        Row: {
          account_code: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rate: number
          tax_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_code?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate?: number
          tax_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_code?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          tax_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_taxes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_uoms: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_uoms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      md_warehouses: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          pic_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pic_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pic_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_warehouses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_public_signup: boolean
          max_company: number | null
          max_users: number | null
          max_workspace: number | null
          monthly_price: number | null
          name: string
          product_line: Database["public"]["Enums"]["product_line"]
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public_signup?: boolean
          max_company?: number | null
          max_users?: number | null
          max_workspace?: number | null
          monthly_price?: number | null
          name: string
          product_line: Database["public"]["Enums"]["product_line"]
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public_signup?: boolean
          max_company?: number | null
          max_users?: number | null
          max_workspace?: number | null
          monthly_price?: number | null
          name?: string
          product_line?: Database["public"]["Enums"]["product_line"]
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          callback_url: string | null
          client_key: string | null
          created_at: string
          display_name: string
          id: string
          instructions: string | null
          is_active: boolean
          merchant_id: string | null
          mode: string
          provider: string
          server_key_secret_name: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          callback_url?: string | null
          client_key?: string | null
          created_at?: string
          display_name: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          merchant_id?: string | null
          mode?: string
          provider: string
          server_key_secret_name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          callback_url?: string | null
          client_key?: string | null
          created_at?: string
          display_name?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          merchant_id?: string | null
          mode?: string
          provider?: string
          server_key_secret_name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      prc_document_lines: {
        Row: {
          created_at: string
          description: string | null
          discount: number
          document_id: string
          id: string
          item_code: string | null
          line_no: number
          line_total: number
          qty: number
          qty_fulfilled: number
          source_line_id: string | null
          tax_rate: number
          unit_price: number
          uom_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount?: number
          document_id: string
          id?: string
          item_code?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          qty_fulfilled?: number
          source_line_id?: string | null
          tax_rate?: number
          unit_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount?: number
          document_id?: string
          id?: string
          item_code?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          qty_fulfilled?: number
          source_line_id?: string | null
          tax_rate?: number
          unit_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prc_document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "prc_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prc_document_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prc_documents: {
        Row: {
          bank_account_code: string | null
          bank_account_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          doc_date: string
          doc_number: string
          doc_type: Database["public"]["Enums"]["prc_doc_type"]
          due_date: string | null
          id: string
          notes: string | null
          reference: string | null
          source_doc_number: string | null
          source_document_id: string | null
          status: Database["public"]["Enums"]["prc_doc_status"]
          subtotal: number
          supplier_code: string | null
          supplier_name: string | null
          tax_amount: number
          total: number
          updated_at: string
          warehouse_code: string | null
          workspace_id: string
        }
        Insert: {
          bank_account_code?: string | null
          bank_account_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          doc_date?: string
          doc_number: string
          doc_type: Database["public"]["Enums"]["prc_doc_type"]
          due_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source_doc_number?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["prc_doc_status"]
          subtotal?: number
          supplier_code?: string | null
          supplier_name?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_code?: string | null
          workspace_id: string
        }
        Update: {
          bank_account_code?: string | null
          bank_account_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          doc_date?: string
          doc_number?: string
          doc_type?: Database["public"]["Enums"]["prc_doc_type"]
          due_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source_doc_number?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["prc_doc_status"]
          subtotal?: number
          supplier_code?: string | null
          supplier_name?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_code?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prc_documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "prc_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prc_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registrations: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          city: string | null
          company_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          industry: string | null
          notes: string | null
          package_code: string
          phone: string
          status: Database["public"]["Enums"]["registration_status"]
          subdomain: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          city?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          id?: string
          industry?: string | null
          notes?: string | null
          package_code: string
          phone: string
          status?: Database["public"]["Enums"]["registration_status"]
          subdomain: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          city?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          industry?: string | null
          notes?: string | null
          package_code?: string
          phone?: string
          status?: Database["public"]["Enums"]["registration_status"]
          subdomain?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          channel: string
          created_at: string
          id: string
          invoice_id: string | null
          message: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          tenant_id: string | null
          type: Database["public"]["Enums"]["reminder_type"]
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          message?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          tenant_id?: string | null
          type: Database["public"]["Enums"]["reminder_type"]
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          message?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["reminder_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          body_en: string | null
          body_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_published: boolean
          key: string
          link_url: string | null
          section: string
          sort_order: number
          title_en: string | null
          title_id: string | null
          updated_at: string
        }
        Insert: {
          body_en?: string | null
          body_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          key: string
          link_url?: string | null
          section: string
          sort_order?: number
          title_en?: string | null
          title_id?: string | null
          updated_at?: string
        }
        Update: {
          body_en?: string | null
          body_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          key?: string
          link_url?: string | null
          section?: string
          sort_order?: number
          title_en?: string | null
          title_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sls_document_lines: {
        Row: {
          created_at: string
          description: string | null
          discount: number
          document_id: string
          id: string
          item_code: string | null
          line_no: number
          line_total: number
          qty: number
          qty_fulfilled: number
          source_line_id: string | null
          tax_rate: number
          unit_price: number
          uom_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount?: number
          document_id: string
          id?: string
          item_code?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          qty_fulfilled?: number
          source_line_id?: string | null
          tax_rate?: number
          unit_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount?: number
          document_id?: string
          id?: string
          item_code?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          qty_fulfilled?: number
          source_line_id?: string | null
          tax_rate?: number
          unit_price?: number
          uom_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sls_document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sls_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sls_document_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sls_documents: {
        Row: {
          bank_account_code: string | null
          bank_account_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_code: string | null
          customer_name: string | null
          discount_amount: number
          doc_date: string
          doc_number: string
          doc_type: Database["public"]["Enums"]["sls_doc_type"]
          due_date: string | null
          id: string
          notes: string | null
          reference: string | null
          source_doc_number: string | null
          source_document_id: string | null
          status: Database["public"]["Enums"]["prc_doc_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          warehouse_code: string | null
          workspace_id: string
        }
        Insert: {
          bank_account_code?: string | null
          bank_account_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_code?: string | null
          customer_name?: string | null
          discount_amount?: number
          doc_date?: string
          doc_number: string
          doc_type: Database["public"]["Enums"]["sls_doc_type"]
          due_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source_doc_number?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["prc_doc_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_code?: string | null
          workspace_id: string
        }
        Update: {
          bank_account_code?: string | null
          bank_account_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_code?: string | null
          customer_name?: string | null
          discount_amount?: number
          doc_date?: string
          doc_number?: string
          doc_type?: Database["public"]["Enums"]["sls_doc_type"]
          due_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source_doc_number?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["prc_doc_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_code?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sls_documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "sls_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sls_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sls_shipment_scans: {
        Row: {
          buyer_name: string | null
          courier: string | null
          created_at: string
          doc_number: string | null
          document_id: string | null
          id: string
          item_summary: string | null
          marketplace: string
          notes: string | null
          order_no: string | null
          scan_date: string
          scanned_by: string | null
          shipped_at: string | null
          status: string
          tracking_no: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          buyer_name?: string | null
          courier?: string | null
          created_at?: string
          doc_number?: string | null
          document_id?: string | null
          id?: string
          item_summary?: string | null
          marketplace?: string
          notes?: string | null
          order_no?: string | null
          scan_date?: string
          scanned_by?: string | null
          shipped_at?: string | null
          status?: string
          tracking_no: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          buyer_name?: string | null
          courier?: string | null
          created_at?: string
          doc_number?: string | null
          document_id?: string | null
          id?: string
          item_summary?: string | null
          marketplace?: string
          notes?: string | null
          order_no?: string | null
          scan_date?: string
          scanned_by?: string | null
          shipped_at?: string | null
          status?: string
          tracking_no?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sls_shipment_scans_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sls_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sls_shipment_scans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          package_id: string | null
          seats: number
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          package_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          package_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          tenant_id: string | null
          ticket_no: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          tenant_id?: string | null
          ticket_no: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          tenant_id?: string | null
          ticket_no?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_records: {
        Row: {
          base_amount: number
          created_at: string
          created_by: string | null
          description: string | null
          doc_number: string | null
          faktur_number: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          partner_name: string | null
          partner_tax_id: string | null
          period: string | null
          rate: number
          ref_id: string | null
          ref_type: string | null
          status: string
          tax_amount: number
          tax_date: string
          tax_no: string
          tax_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_number?: string | null
          faktur_number?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_name?: string | null
          partner_tax_id?: string | null
          period?: string | null
          rate?: number
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          tax_amount?: number
          tax_date?: string
          tax_no: string
          tax_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_number?: string | null
          faktur_number?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_name?: string | null
          partner_tax_id?: string | null
          period?: string | null
          rate?: number
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          tax_amount?: number
          tax_date?: string
          tax_no?: string
          tax_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          city: string | null
          created_at: string
          ends_at: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          owner_id: string | null
          package_id: string | null
          pic_email: string | null
          pic_name: string | null
          pic_phone: string | null
          started_at: string
          status: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          trial_ends_at: string | null
          updated_at: string
          user_count: number
          workspace_count: number
        }
        Insert: {
          city?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          package_id?: string | null
          pic_email?: string | null
          pic_name?: string | null
          pic_phone?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          trial_ends_at?: string | null
          updated_at?: string
          user_count?: number
          workspace_count?: number
        }
        Update: {
          city?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          package_id?: string | null
          pic_email?: string | null
          pic_name?: string | null
          pic_phone?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_count?: number
          workspace_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenants_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      upgrade_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          requested_by: string | null
          requested_package_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          requested_package_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          requested_package_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upgrade_requests_requested_package_id_fkey"
            columns: ["requested_package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrade_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrade_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_role_access: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_costing_method: Database["public"]["Enums"]["costing_method"]
          fiscal_year_start_month: number
          id: string
          legal_name: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          tax_id: string | null
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_costing_method?: Database["public"]["Enums"]["costing_method"]
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          tax_id?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_costing_method?: Database["public"]["Enums"]["costing_method"]
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          tax_id?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      claim_superadmin: { Args: never; Returns: boolean }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      owns_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "customer"
      billing_cycle: "monthly" | "yearly"
      costing_method: "FIFO" | "LIFO" | "AVERAGE"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "void"
      lead_status: "new" | "contacted" | "qualified" | "won" | "lost"
      md_account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      md_item_type: "goods" | "service"
      prc_doc_status:
        | "draft"
        | "submitted"
        | "approved"
        | "received"
        | "invoiced"
        | "paid"
        | "cancelled"
        | "partial"
        | "closed"
      prc_doc_type:
        | "purchase_request"
        | "purchase_order"
        | "goods_receipt"
        | "ap_invoice"
        | "purchase_return"
        | "purchase_payment"
      product_line: "one" | "business" | "enterprise"
      registration_status: "pending" | "verified" | "provisioned" | "rejected"
      reminder_status: "scheduled" | "sent" | "cancelled"
      reminder_type: "invoice_due" | "trial_ending" | "renewal" | "overdue"
      sls_doc_type:
        | "quotation"
        | "sales_order"
        | "delivery_order"
        | "ar_invoice"
        | "sales_receipt"
        | "sales_return"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
      tenant_status: "trial" | "active" | "suspended" | "cancelled"
      workspace_role: "owner" | "admin" | "staff" | "viewer"
      workspace_status: "setup" | "active" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "customer"],
      billing_cycle: ["monthly", "yearly"],
      costing_method: ["FIFO", "LIFO", "AVERAGE"],
      invoice_status: ["draft", "sent", "paid", "overdue", "void"],
      lead_status: ["new", "contacted", "qualified", "won", "lost"],
      md_account_type: ["asset", "liability", "equity", "revenue", "expense"],
      md_item_type: ["goods", "service"],
      prc_doc_status: [
        "draft",
        "submitted",
        "approved",
        "received",
        "invoiced",
        "paid",
        "cancelled",
        "partial",
        "closed",
      ],
      prc_doc_type: [
        "purchase_request",
        "purchase_order",
        "goods_receipt",
        "ap_invoice",
        "purchase_return",
        "purchase_payment",
      ],
      product_line: ["one", "business", "enterprise"],
      registration_status: ["pending", "verified", "provisioned", "rejected"],
      reminder_status: ["scheduled", "sent", "cancelled"],
      reminder_type: ["invoice_due", "trial_ending", "renewal", "overdue"],
      sls_doc_type: [
        "quotation",
        "sales_order",
        "delivery_order",
        "ar_invoice",
        "sales_receipt",
        "sales_return",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
      tenant_status: ["trial", "active", "suspended", "cancelled"],
      workspace_role: ["owner", "admin", "staff", "viewer"],
      workspace_status: ["setup", "active", "suspended"],
    },
  },
} as const
