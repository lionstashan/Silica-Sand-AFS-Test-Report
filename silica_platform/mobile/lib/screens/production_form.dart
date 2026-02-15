import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class ProductionFormScreen extends StatefulWidget {
  const ProductionFormScreen({super.key});
  @override
  State<ProductionFormScreen> createState() => _ProductionFormScreenState();
}

class _ProductionFormScreenState extends State<ProductionFormScreen> {
  final _plantCtrl = TextEditingController();
  final _qtyCtrl = TextEditingController();
  final List<Map<String, String>> _breakup = [{ 'grade': '', 'qty': '' }];
  String _qcStatus = 'Pending';
  final _qcGradeCtrl = TextEditingController();
  final _feedbackCtrl = TextEditingController();

  void _addGrade() => setState(() => _breakup.add({ 'grade': '', 'qty': '' }));
  void _removeGrade(int i) => setState(() => _breakup.removeAt(i));

  Future<void> _submit() async {
    final plant = _plantCtrl.text.trim();
    final qty = double.tryParse(_qtyCtrl.text.trim());
    if (plant.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Plant is required')));
      return;
    }
    final gradeBreakup = <String, num>{};
    for (final row in _breakup) {
      final g = row['grade']!.trim();
      final q = double.tryParse(row['qty']!.trim() ?? '');
      if (g.isNotEmpty && (q ?? -1) >= 0) gradeBreakup[g] = q!;
    }
    final payload = {
      'type': 'Production',
      'status': 'Open',
      'plant': plant,
      if (qty != null && qty >= 0) 'productionQty': qty,
      'gradeBreakup': gradeBreakup,
      'qc': { 'status': _qcStatus, if (_qcGradeCtrl.text.isNotEmpty) 'grade': _qcGradeCtrl.text, if (_feedbackCtrl.text.isNotEmpty) 'feedback': _feedbackCtrl.text }
    };
    await FirebaseFirestore.instance.collection('tickets').add(payload);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Production Ticket')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            TextField(controller: _plantCtrl, decoration: const InputDecoration(labelText: 'Plant')),
            TextField(controller: _qtyCtrl, decoration: const InputDecoration(labelText: 'Production Qty'), keyboardType: TextInputType.number),
            const SizedBox(height: 12),
            const Text('Grade Breakup'),
            for (int i = 0; i < _breakup.length; i++)
              Row(children: [
                Expanded(child: TextField(onChanged: (v) => _breakup[i]['grade'] = v, decoration: const InputDecoration(labelText: 'Grade'))),
                const SizedBox(width: 8),
                Expanded(child: TextField(onChanged: (v) => _breakup[i]['qty'] = v, decoration: const InputDecoration(labelText: 'Qty'), keyboardType: TextInputType.number)),
                IconButton(onPressed: () => _removeGrade(i), icon: const Icon(Icons.remove_circle))
              ]),
            TextButton(onPressed: _addGrade, child: const Text('Add Grade')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(value: _qcStatus, items: const [
              DropdownMenuItem(value: 'Pending', child: Text('Pending')),
              DropdownMenuItem(value: 'Pass', child: Text('Pass')),
              DropdownMenuItem(value: 'Fail', child: Text('Fail')),
            ], onChanged: (v) => setState(() => _qcStatus = v ?? 'Pending'), decoration: const InputDecoration(labelText: 'QC Status')),
            TextField(controller: _qcGradeCtrl, decoration: const InputDecoration(labelText: 'QC Grade')),
            TextField(controller: _feedbackCtrl, decoration: const InputDecoration(labelText: 'Feedback')),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _submit, child: const Text('Create Ticket'))
          ],
        ),
      ),
    );
  }
}
