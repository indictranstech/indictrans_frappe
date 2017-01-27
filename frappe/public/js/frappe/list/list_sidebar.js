// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide('frappe.views');

// opts:
// stats = list of fields
// doctype
// parent
// set_filter = function called on click

frappe.views.ListSidebar = Class.extend({
	init: function(opts) {
		$.extend(this, opts);
		this.make();
		this.get_stats();
		this.cat_tags = [];
	},
	make: function() {
		var sidebar_content = frappe.render_template("list_sidebar", {doctype: this.doclistview.doctype});

		this.sidebar = $('<div class="list-sidebar overlay-sidebar hidden-xs hidden-sm"></div>')
			.html(sidebar_content)
			.appendTo(this.page.sidebar.empty());

		this.setup_reports();
		this.setup_assigned_to_me();
		this.setup_views();
		this.setup_kanban_boards();

	},
	setup_views: function() {
		var show_list_link = false;

		if(frappe.views.calendar[this.doctype]) {
			this.sidebar.find(".calendar-link").removeClass("hide");
			this.sidebar.find('.list-link[data-view="Gantt"]').removeClass('hide');
			show_list_link = true;
		}
		//show link for kanban view
		this.sidebar.find('.list-link[data-view="Kanban"]').removeClass('hide');

		if(frappe.treeview_settings[this.doctype]) {
			this.sidebar.find(".tree-link").removeClass("hide");
		}

		this.current_view = 'List';
		var route = frappe.get_route();
		if(route.length > 2 && in_list(['Gantt', 'Image', 'Kanban'], route[2])) {
			this.current_view = route[2];

			if(this.current_view === 'Kanban') {
				this.kanban_board = route[3];
			}
		}

		// disable link for current view
		this.sidebar.find('.list-link[data-view="'+ this.current_view +'"] a')
			.attr('disabled', 'disabled').addClass('disabled');

		//enable link for Kanban view
		this.sidebar.find('.list-link[data-view="Kanban"] a')
			.attr('disabled', null).removeClass('disabled')

		// show image link if image_view
		if(this.doclistview.meta.image_field) {
			this.sidebar.find('.list-link[data-view="Image"]').removeClass('hide');
			show_list_link = true;
		}

		if(show_list_link) {
			this.sidebar.find('.list-link[data-view="List"]').removeClass('hide');
		}
	},
	setup_reports: function() {
		// add reports linked to this doctype to the dropdown
		var me = this;
		var added = [];
		var dropdown = this.page.sidebar.find('.reports-dropdown');
		var divider = false;

		var add_reports = function(reports) {
			$.each(reports, function(name, r) {
				if(!r.ref_doctype || r.ref_doctype==me.doctype) {
					var report_type = r.report_type==='Report Builder'
						? 'Report/' + r.ref_doctype : 'query-report';
					var route = r.route || report_type + '/' + r.name;

					if(added.indexOf(route)===-1) {
						// don't repeat
						added.push(route);

						if(!divider) {
							$('<li role="separator" class="divider"></li>').appendTo(dropdown);
							divider = true;
						}

						$('<li><a href="#'+ route + '">'
							+ __(r.name)+'</a></li>').appendTo(dropdown);
					}
				}
			});
		}

		// from reference doctype
		if(this.doclistview.listview.settings.reports) {
			add_reports(this.doclistview.listview.settings.reports)
		}

		// from specially tagged reports
		add_reports(frappe.boot.user.all_reports || []);
	},
	setup_kanban_boards: function() {
		// add kanban boards linked to this doctype to the dropdown
		var me = this;
		var $dropdown = this.page.sidebar.find('.kanban-dropdown');
		var divider = false;

		var boards = frappe.get_meta(this.doctype).__kanban_boards;
		if (!boards) return;
		boards.forEach(function(board) {
			var route = ["List", board.parent, "Kanban", board.name].join('/');
			if(!divider) {
				$('<li role="separator" class="divider"></li>').appendTo($dropdown);
				divider = true;
			}
			$('<li><a href="#'+ route + '">'+board.name+'</a></li>').appendTo($dropdown);
		});

		$dropdown.find('.new-kanban-board').click(function() {
			// frappe.new_doc('Kanban Board', {reference_doctype: me.doctype});
			var select_fields = frappe.get_meta(me.doctype)
				.fields.filter(function(df) {
					return df.fieldtype === 'Select';
				}).map(function(df) {
					return df.fieldname;
				});

			var fields = [
				{
					fieldtype: 'Data',
					fieldname: 'board_name',
					label: __('Kanban Board Name'),
					reqd: 1
				}
			]

			if(select_fields.length > 0) {
				fields = fields.concat([{
					fieldtype: 'Select',
					fieldname: 'field_name',
					label: __('Columns based on'),
					options: select_fields.join('\n'),
					default: select_fields[0]
				},
				{
					fieldtype: 'Check',
					fieldname: 'custom_column',
					label: __('Add Custom Column Field'),
					default: 0,
					onchange: function(e) {
						var checked = d.get_value('custom_column');
						if(checked) {
							d.get_input('field_name').prop('disabled', true);
						} else {
							d.get_input('field_name').prop('disabled', null);
						}
					}
				}]);
			}

			var d = new frappe.ui.Dialog({
				title: __('New Kanban Board'),
				fields: fields,
				primary_action: function() {
					var values = d.get_values();
					var custom_column = values.custom_column !== undefined ?
						values.custom_column : 1;

					me.add_custom_column_field(custom_column)
						.then(function(custom_column) {
							console.log(custom_column)
							var f = custom_column ?
								'kanban_column' : values.field_name;
							console.log(f)
							return me.make_kanban_board(values.board_name, f)
						})
						.then(function() {
							d.hide();
						}, function(err) {
							msgprint(err);
						});
				}
			});
			d.show();
		});
	},
	add_custom_column_field: function(flag) {
		var me = this;
		return new Promise(function(resolve, reject) {
			if(!flag) resolve(false);
			frappe.call({
				method: 'frappe.custom.doctype.custom_field.custom_field.add_custom_field',
				args: {
					doctype: me.doctype,
					df: {
						label: 'Kanban Column',
						fieldname: 'kanban_column',
						fieldtype: 'Select',
						hidden: 1
					}
				}
			}).success(function() {
				resolve(true);
			}).error(function(err) {
				reject(err);
			});
		});
	},
	make_kanban_board: function(board_name, field_name) {
		var me = this;
		return frappe.call({
			method: 'frappe.desk.doctype.kanban_board.kanban_board.quick_kanban_board',
			args: {
				doctype: me.doctype,
				board_name: board_name,
				field_name: field_name
			},
			callback: function(r) {
				frappe.set_route(
					'List',
					me.doctype,
					'Kanban',
					r.message.kanban_board_name
				);
			}
		});
	},
	setup_assigned_to_me: function() {
		var me = this;
		this.page.sidebar.find(".assigned-to-me a").on("click", function() {
			me.doclistview.assigned_to_me();
		});
	},
	get_cat_tags:function(){
		return this.cat_tags;
	},
	get_stats: function() {
		var me = this
		frappe.call({
			method: 'frappe.desk.reportview.get_sidebar_stats',
			args: {
				stats: me.stats,
				doctype: me.doctype,
				filters:me.default_filters
			},
			callback: function(r) {
				me.defined_category = r.message;
				if (r.message.defined_cat ){
					me.defined_category = r.message.defined_cat
					 me.cats = {};
					//structure the tag categories
					for (i in me.defined_category){
						if (me.cats[me.defined_category[i].category]===undefined){
							me.cats[me.defined_category[i].category]=[me.defined_category[i].tag];
						}else{
							me.cats[me.defined_category[i].category].push(me.defined_category[i].tag);
						}
						me.cat_tags[i]=me.defined_category[i].tag
					}
					me.tempstats =r.message.stats
					var len = me.cats.length;
					$.each(me.cats, function (i, v) {
						me.render_stat(i, (me.tempstats || {})["_user_tags"],v);
					});
					me.render_stat("_user_tags", (me.tempstats || {})["_user_tags"]);
				}
				else
				{
					//render normal stats
					me.render_stat("_user_tags", (r.message.stats|| {})["_user_tags"]);
				}
				me.doclistview.set_sidebar_height();
			}
		});
	},
	render_stat: function(field, stat, tags) {
		var me = this;
		var sum = 0;
		var stats = []
		var label = frappe.meta.docfield_map[this.doctype][field] ?
			frappe.meta.docfield_map[this.doctype][field].label : field;
		var show_tags = '<a class="list-tag-preview hidden-xs" title="' + __("Show tags")
			+ '"><i class="octicon octicon-pencil"></i></a>';

		stat = (stat || []).sort(function(a, b) { return b[1] - a[1] });
		$.each(stat, function(i,v) { sum = sum + v[1]; })

		if(tags)
		{
			for (var t in tags) {
				var nfound = -1;
				for (var i in stat) {
					if (tags[t] ===stat[i][0]) {
						stats.push(stat[i]);
						nfound = i;
						break
					}
				}
				if (nfound<0)
				{
					stats.push([tags[t],0])
				}
				else
				{
					me.tempstats["_user_tags"].splice(nfound,1);
				}
			}
			field = "_user_tags"
		}
		else
		{
			stats = stat
		}
		var context = {
			field: field,
			stat: stats,
			sum: sum,
			label: field==='_user_tags' ?  tags ? __(label)+ show_tags:(__("UnCategorised Tags") + show_tags): __(label),
		};
		var sidebar_stat = $(frappe.render_template("list_sidebar_stat", context))
			.on("click", ".stat-link", function() {
				var fieldname = $(this).attr('data-field');
				var label = $(this).attr('data-label');
				if (label == "No Tags") {
					me.doclistview.filter_list.add_filter(me.doclistview.doctype, fieldname, 'not like', '%,%')
					me.doclistview.run();
				} else {
					me.set_filter(fieldname, label);
				}
			})
			.insertBefore(this.sidebar.find(".close-sidebar-button"));
	},
	set_fieldtype: function(df, fieldtype) {

		// scrub
		if(df.fieldname=="docstatus") {
			df.fieldtype="Select",
			df.options=[
				{value:0, label:"Draft"},
				{value:1, label:"Submitted"},
				{value:2, label:"Cancelled"},
			]
		} else if(df.fieldtype=='Check') {
			df.fieldtype='Select';
			df.options=[{value:0,label:'No'},
				{value:1,label:'Yes'}]
		} else if(['Text','Small Text','Text Editor','Code','Tag','Comments',
			'Dynamic Link','Read Only','Assign'].indexOf(df.fieldtype)!=-1) {
			df.fieldtype = 'Data';
		} else if(df.fieldtype=='Link' && this.$w.find('.condition').val()!="=") {
			df.fieldtype = 'Data';
		}
		if(df.fieldtype==="Data" && (df.options || "").toLowerCase()==="email") {
			df.options = null;
		}
	},
	reload_stats: function() {
		this.sidebar.find(".sidebar-stat").remove();
		this.get_stats();
	},
});
