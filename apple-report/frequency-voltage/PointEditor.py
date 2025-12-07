import sys
import json
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
matplotlib.use('QtAgg')
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout,
    QHBoxLayout, QTableWidget, QTableWidgetItem, QCheckBox,
    QHeaderView, QMessageBox, QLabel, QTabWidget, QTextEdit,
    QPushButton, QGroupBox, QSizePolicy
)
from PyQt6.QtCore import Qt
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from matplotlib.lines import Line2D
from matplotlib.backend_bases import MouseButton
INITIAL_DATA_GROUPS = {}
DEFAULT_EMPTY_GROUP_DATA = {
    "Curve A": [],
    "Curve B": []
}
MAX_HISTORY_DEPTH = 10
class PointEditor:
    def __init__(self, line, update_table_callback):
        self.line = line
        self.canvas = line.axes.figure.canvas
        self.update_table = update_table_callback
        self.x = self.line.get_xdata()
        self.y = self.line.get_ydata()
        self._ind = None
        self.cid_press = self.canvas.mpl_connect('button_press_event', self.on_press)
        self.cid_release = self.canvas.mpl_connect('button_release_event', self.on_release)
        self.cid_motion = self.canvas.mpl_connect('motion_notify_event', self.on_motion)
    def get_ind_under_point(self, event):
        xy = np.asarray(self.line.get_data()).T
        xyt = self.line.axes.transData.transform(xy)
        d = np.sqrt((xyt[:, 0] - event.x)**2 + (xyt[:, 1] - event.y)**2)
        ind_closest = np.argmin(d)
        return ind_closest if d[ind_closest] < 10 else None
    def on_press(self, event):
        if event.inaxes != self.line.axes:
            return
        if event.button == MouseButton.RIGHT:
            self._ind = self.get_ind_under_point(event)
            if self._ind is not None:
                self.remove_point(self._ind)
            return
        if event.button == MouseButton.LEFT:
            self._ind = self.get_ind_under_point(event)
            return
    def remove_point(self, ind):
        self.x = np.delete(self.x, ind)
        self.y = np.delete(self.y, ind)
        self.line.set_data(self.x, self.y)
        self.canvas.draw_idle()
        self.update_table(self.line.get_label(), 'delete', ind)
    def on_motion(self, event):
        if self._ind is None or event.inaxes != self.line.axes or event.button != MouseButton.LEFT:
            return
        self.x[self._ind] = event.xdata
        self.y[self._ind] = event.ydata
        self.line.set_data(self.x, self.y)
        self.canvas.draw_idle()
        self.update_table(self.line.get_label(), 'move', self._ind, new_x=event.xdata, new_y=event.ydata)
    def on_release(self, event):
        self._ind = None
class MatplotlibCanvas(FigureCanvas):
    def __init__(self, parent=None, width=5, height=4, dpi=100):
        fig = Figure(figsize=(width, height), dpi=dpi)
        self.axes = fig.add_subplot(111)
        super().__init__(fig)
        self.setParent(parent)
        self.axes.set_xlabel('Freq (MHz)')
        self.axes.set_ylabel('Voltage (mV)')
        self.axes.set_title('Interactive Curve Editor')
        self.axes.grid(True)
        self.lines = {}
        self.editors = {}
        self.colors = ['r', 'b', 'g', 'm']
    def plot_data(self, data_storage, update_table_callback):
        self.axes.clear()
        self.lines = {}
        self.editors = {}
        self.axes.grid(True)
        for i, (name, data) in enumerate(data_storage.items()):
            freqs = [float(d['freq_mhz']) for d in data]
            voltages = [float(d['voltage_mv']) for d in data]
            line, = self.axes.plot(freqs, voltages,
                                 marker='o', linestyle='-',
                                 color=self.colors[i % len(self.colors)],
                                 label=name)
            self.lines[name] = line
            editor = PointEditor(line, update_table_callback)
            self.editors[name] = editor
        self.axes.legend()
        self.draw()
class TableWidget(QTableWidget):
    def __init__(self, curve_name, data, update_plot_callback, update_json_callback, save_history_callback):
        super().__init__()
        self.curve_name = curve_name
        self.update_plot = update_plot_callback
        self.update_json = update_json_callback
        self.save_history = save_history_callback
        self.data = data
        self.setRowCount(len(data))
        self.setColumnCount(2)
        self.setHorizontalHeaderLabels(['freq_mhz', 'voltage_mv'])
        header = self.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.populate_table()
        self.cellChanged.connect(self.on_cell_changed)
    def populate_table(self):
        self.blockSignals(True)
        self.setRowCount(len(self.data))
        for row, item in enumerate(self.data):
            self.setItem(row, 0, QTableWidgetItem(str(int(item['freq_mhz']))))
            self.setItem(row, 1, QTableWidgetItem(str(int(item['voltage_mv']))))
        self.blockSignals(False)
    def on_cell_changed(self, row, column):
        try:
            if not self.item(row, column):
                 return
            self.save_history()
            new_value = int(round(float(self.item(row, column).text())))
            key = self.horizontalHeaderItem(column).text()
            self.data[row][key] = new_value
            self.blockSignals(True)
            self.item(row, column).setText(str(new_value))
            self.blockSignals(False)
            self.update_plot(self.curve_name, self.data)
            self.update_json()
        except ValueError:
            QMessageBox.warning(self, "输入错误", "请输入有效的数字 (将自动取整)。")
            self.populate_table()
    def add_row(self):
        current_row = self.currentRow()
        insert_index = current_row + 1 if current_row >= 0 else self.rowCount()
        if insert_index > 0:
            default_data = self.data[insert_index - 1].copy()
            default_data['freq_mhz'] = int(default_data['freq_mhz']) + 10
            default_data['voltage_mv'] = int(default_data['voltage_mv']) + 1
        else:
            default_data = {"freq_mhz": 500, "voltage_mv": 650}
        self.save_history()
        self.data.insert(insert_index, default_data)
        self.insertRow(insert_index)
        self.setItem(insert_index, 0, QTableWidgetItem(str(default_data['freq_mhz'])))
        self.setItem(insert_index, 1, QTableWidgetItem(str(default_data['voltage_mv'])))
        self.update_plot(self.curve_name, self.data)
        self.update_json()
    def remove_row(self):
        current_row = self.currentRow()
        if current_row < 0:
            QMessageBox.warning(self, "操作失败", "请先在表格中选择要删除的行。")
            return
        self.save_history()
        del self.data[current_row]
        self.removeRow(current_row)
        self.update_plot(self.curve_name, self.data)
        self.update_json()
    def update_from_drag(self, action, index, new_x=None, new_y=None, new_data=None):
        self.blockSignals(True)
        self.save_history()
        if action == 'move':
            x_int = int(round(new_x))
            y_int = int(round(new_y))
            self.data[index]['freq_mhz'] = x_int
            self.data[index]['voltage_mv'] = y_int
            self.item(index, 0).setText(str(x_int))
            self.item(index, 1).setText(str(y_int))
        elif action == 'delete':
            del self.data[index]
            self.removeRow(index)
        self.blockSignals(False)
        self.update_json()
class CurveGroupWidget(QWidget):
    def __init__(self, group_name, initial_data, main_window):
        super().__init__()
        self.group_name = group_name
        self.data_storage = initial_data
        self.main_window = main_window
        self.table_widgets = {}
        self.curve_names_list = list(initial_data.keys())
        self.history_stack = []
        self.history_pointer = -1
        self._save_history(initial_load=True)
        self.setLayout(self._create_main_layout())
        self.canvas.plot_data(self.data_storage, self._update_table_from_drag)
        self._sync_json_from_data()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.grabKeyboard()
    def keyPressEvent(self, event):
        is_ctrl_or_cmd = event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)
        is_shift = event.modifiers() & Qt.KeyboardModifier.ShiftModifier
        if is_ctrl_or_cmd and event.key() == Qt.Key.Key_Z:
            if is_shift:
                self.redo()
            else:
                self.undo()
            event.accept()
        elif is_ctrl_or_cmd and event.key() == Qt.Key.Key_Y:
            self.redo()
            event.accept()
        else:
            super().keyPressEvent(event)
    def _save_history(self, initial_load=False):
        if not initial_load:
            if self.history_pointer < len(self.history_stack) - 1:
                self.history_stack = self.history_stack[:self.history_pointer + 1]
        data_copy = json.loads(json.dumps(self.data_storage))
        self.history_stack.append(data_copy)
        if len(self.history_stack) > MAX_HISTORY_DEPTH:
            self.history_stack.pop(0)
        self.history_pointer = len(self.history_stack) - 1
    def _load_state(self, index):
        if 0 <= index < len(self.history_stack):
            self.history_pointer = index
            new_state = self.history_stack[index]
            self.data_storage = new_state
            self.canvas.plot_data(self.data_storage, self._update_table_from_drag)
            for name, table in self.table_widgets.items():
                table.data = self.data_storage[name]
                table.populate_table()
            self._sync_json_from_data()
            return True
        return False
    def undo(self):
        if self.history_pointer > 0:
            self._load_state(self.history_pointer - 1)
        else:
            QMessageBox.information(self, "操作失败", "没有历史记录可以撤销了。")
    def redo(self):
        if self.history_pointer < len(self.history_stack) - 1:
            self._load_state(self.history_pointer + 1)
        else:
            QMessageBox.information(self, "操作失败", "没有历史记录可以重做了。")
    def _create_main_layout(self):
        main_layout = QHBoxLayout()
        self.canvas = MatplotlibCanvas(self)
        main_layout.addWidget(self.canvas, 2)
        control_area = QVBoxLayout()
        main_layout.addLayout(control_area, 1)
        control_area.addWidget(self._create_visibility_controls())
        control_area.addWidget(QLabel(f"操作提示: 撤销(Ctrl+Z), 重做(Ctrl+Y)。最大历史步数: {MAX_HISTORY_DEPTH}。"))
        self.tabs = self._create_table_tabs()
        control_area.addWidget(self.tabs, 1)
        self._create_json_editor(control_area)
        return main_layout
    def _create_visibility_controls(self):
        group_box = QGroupBox("曲线显示开关")
        layout = QHBoxLayout(group_box)
        for name in self.data_storage.keys():
            checkbox = QCheckBox(name)
            checkbox.setChecked(True)
            checkbox.stateChanged.connect(lambda state, n=name: self._toggle_visibility(n, state))
            layout.addWidget(checkbox)
        layout.addStretch(1)
        return group_box
    def _create_table_tabs(self):
        tab_widget = QTabWidget()
        for name, data in self.data_storage.items():
            tab_content = QWidget()
            vbox = QVBoxLayout(tab_content)
            button_layout = QHBoxLayout()
            add_button = QPushButton("➕ 添加行")
            remove_button = QPushButton("➖ 删除行 (选中行)")
            table = TableWidget(name, data, self._update_plot_from_table, self._sync_json_from_data, self._save_history)
            add_button.clicked.connect(table.add_row)
            remove_button.clicked.connect(table.remove_row)
            button_layout.addWidget(add_button)
            button_layout.addWidget(remove_button)
            vbox.addLayout(button_layout)
            vbox.addWidget(table)
            self.table_widgets[name] = table
            tab_widget.addTab(tab_content, name)
        return tab_widget
    def _create_json_editor(self, parent_layout):
        json_group = QGroupBox("JSON 数据 (紧凑列表格式)")
        layout = QVBoxLayout(json_group)
        self.json_editor = QTextEdit()
        self.json_editor.setPlaceholderText("在这里粘贴完整 JSON 列表数据，然后点击 '导入'")
        self.json_editor.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout.addWidget(self.json_editor, 1)
        button_layout = QHBoxLayout()
        import_button = QPushButton("从 JSON 导入图表/表格")
        import_button.clicked.connect(self._import_from_json)
        button_layout.addWidget(import_button)
        button_layout.addStretch(1)
        layout.addLayout(button_layout)
        parent_layout.addWidget(json_group, 1)
    def _toggle_visibility(self, curve_name, state):
        is_visible = state == 2
        line = self.canvas.lines.get(curve_name)
        if line:
            line.set_visible(is_visible)
            self.canvas.draw_idle()
    def _update_plot_from_table(self, curve_name, new_data):
        freqs = [float(d['freq_mhz']) for d in new_data]
        voltages = [float(d['voltage_mv']) for d in new_data]
        line = self.canvas.lines.get(curve_name)
        if line:
            line.set_data(freqs, voltages)
            editor = self.canvas.editors.get(curve_name)
            if editor:
                editor.x = np.array(freqs)
                editor.y = np.array(voltages)
            self.canvas.axes.relim()
            self.canvas.axes.autoscale_view()
            self.canvas.draw_idle()
    def _update_table_from_drag(self, curve_name, action, index, new_x=None, new_y=None, new_data=None):
        table = self.table_widgets.get(curve_name)
        if table:
            table.update_from_drag(action, index, new_x, new_y, new_data)
    def _sync_json_from_data(self):
        self.json_editor.blockSignals(True)
        output_list = []
        for name in self.curve_names_list:
            output_list.append(self.data_storage[name])
        json_output = json.dumps(output_list, separators=(',', ':'))
        self.json_editor.setText(json_output)
        self.json_editor.blockSignals(False)
    def _import_from_json(self):
        try:
            raw_text = self.json_editor.toPlainText().strip()
            if not raw_text:
                raise ValueError("JSON 文本框为空。")
            input_list = json.loads(raw_text)
            if not isinstance(input_list, list):
                raise ValueError("JSON 格式错误：根元素必须是列表 (例如：[[...],[...]])")
            num_input_curves = len(input_list)
            num_expected_curves = len(self.curve_names_list)
            if num_input_curves != num_expected_curves:
                raise ValueError(f"输入数组数量 ({num_input_curves}) 与图表曲线数量 ({num_expected_curves}) 不匹配。")
            self._save_history()
            new_data_storage = {}
            for i, data_array in enumerate(input_list):
                curve_name = self.curve_names_list[i]
                cleaned_array = []
                for d in data_array:
                    cleaned_array.append({
                        'freq_mhz': int(d['freq_mhz']),
                        'voltage_mv': int(d['voltage_mv'])
                    })
                new_data_storage[curve_name] = cleaned_array
            self.data_storage = new_data_storage
            self.canvas.plot_data(self.data_storage, self._update_table_from_drag)
            for name, table in self.table_widgets.items():
                table.data = self.data_storage[name]
                table.populate_table()
            QMessageBox.information(self, "导入成功", f"组 '{self.group_name}' 数据已更新。")
        except json.JSONDecodeError:
            QMessageBox.critical(self, "导入失败", "JSON 文本内容不是有效的 JSON 格式。")
        except ValueError as e:
            QMessageBox.critical(self, "导入失败", f"{e}")
        except Exception as e:
            QMessageBox.critical(self, "未知错误", f"更新失败: {e}")
class MainWindow(QMainWindow):
    def __init__(self, initial_data_groups):
        super().__init__()
        self.setWindowTitle("多组曲线编辑器")
        self.group_data = {}
        self.group_widgets = {}
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.addLayout(self._create_group_controls(), 0)
        self.group_tabs = QTabWidget()
        self.group_tabs.setTabsClosable(True)
        self.group_tabs.tabCloseRequested.connect(self.remove_group)
        main_layout.addWidget(self.group_tabs, 1)
        if not initial_data_groups:
             self._create_and_add_group_tab("Group 1", DEFAULT_EMPTY_GROUP_DATA.copy())
        else:
             for name, data in initial_data_groups.items():
                self._create_and_add_group_tab(name, data)
        self.show()
    def _create_group_controls(self):
        control_bar = QHBoxLayout()
        control_bar.addWidget(QLabel("曲线组操作:"))
        add_btn = QPushButton("➕ 添加新组")
        add_btn.clicked.connect(lambda: self._create_and_add_group_tab(self._generate_new_group_name(), json.loads(json.dumps(DEFAULT_EMPTY_GROUP_DATA))))
        control_bar.addWidget(add_btn)
        remove_btn = QPushButton("➖ 删除当前组")
        remove_btn.clicked.connect(lambda: self.remove_group(self.group_tabs.currentIndex()))
        control_bar.addWidget(remove_btn)
        control_bar.addStretch(1)
        return control_bar
    def _generate_new_group_name(self):
        base = "Group "
        i = 1
        while f"{base}{i}" in self.group_data:
            i += 1
        return f"{base}{i}"
    def _create_and_add_group_tab(self, name, data):
        if name in self.group_data:
            QMessageBox.warning(self, "错误", f"组名 '{name}' 已存在。")
            return
        group_widget = CurveGroupWidget(name, data, self)
        self.group_data[name] = data
        self.group_widgets[name] = group_widget
        index = self.group_tabs.addTab(group_widget, name)
        self.group_tabs.setCurrentIndex(index)
    def remove_group(self, index):
        if self.group_tabs.count() <= 1:
            QMessageBox.warning(self, "操作失败", "至少需要保留一个曲线组。")
            return
        group_name = self.group_tabs.tabText(index)
        reply = QMessageBox.question(self, '确认删除',
            f"确定要删除曲线组 '{group_name}' 吗? 这将丢失所有数据。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No, QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            widget = self.group_tabs.widget(index)
            self.group_tabs.removeTab(index)
            del self.group_data[group_name]
            del self.group_widgets[group_name]
            widget.deleteLater()
    def closeEvent(self, event):
        final_output = []
        for i in range(self.group_tabs.count()):
            widget = self.group_tabs.widget(i)
            group_data_list = []
            for curve_name in widget.curve_names_list:
                group_data_list.append(widget.data_storage[curve_name])
            final_output.append({
                "group_name": widget.group_name,
                "data": group_data_list
            })
        final_json = json.dumps(final_output, separators=(',', ':'))
        plt.close('all')
        event.accept()
if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow(INITIAL_DATA_GROUPS)
    sys.exit(app.exec())
