from __future__ import unicode_literals
import frappe
from frappe.model.rename_doc import rename_doc


def execute():
	if frappe.db.table_exists("Workflow Action") and not frappe.db.table_exists("Workflow Action Main"):
		rename_doc('DocType', 'Workflow Action', 'Workflow Action Main')
		frappe.reload_doc('workflow', 'doctype', 'workflow_action_main')
