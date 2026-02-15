import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class DryingFormScreen extends StatefulWidget {
  const DryingFormScreen({super.key});
  @override
  State<DryingFormScreen> createState() => _DryingFormScreenState();
}

class _DryingFormScreenState extends State<DryingFormScreen> {
  final _bedCtrl = TextEditingController();
  final _gradeCtrl = TextEditingController();
  final _moistureStartCtrl = TextEditingController();
  final _moistureEndCtrl = TextEditingController();
  final _dryQtyCtrl = TextEditingController();
  String _qcStatus = 'Pending';
  final _qcGradeCtrl = TextEditingController();
  final _feedbackCtrl = TextEditingController();

  Future<void> _submit() async {
    final bed = _bedCtrl.text.trim();
    final grade = _gradeCtrl.text.trim();
    if (bed.isEmpty || grade.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bed and Grade are required')));
      return;
    }
    double? ms = double.tryParse(_moistureStartCtrl.text.trim());
    double? me = double.tryParse(_moistureEndCtrl.text.trim());
    double? dq = double.tryParse(_dryQtyCtrl.text.trim());
    final payload = {
      'type': 'Drying',
      'status': 'Open',
      'bed': bed,
      'grade': grade,
      if (ms != null && ms >= 0 && ms <= 100) 'moistureStart': ms,
      if (me != null && me >= 0 && me <= 100) 'moistureEnd': me,
      if (dq != null && dq >= 0) 'dryQty': dq,
      'qc': { 'status': _qcStatus, if (_qcGradeCtrl.text.isNotEmpty) 'grade': _qcGradeCtrl.text, if (_feedbackCtrl.text.isNotEmpty) 'feedback': _feedbackCtrl.text }
    };
    await FirebaseFirestore.instance.collection('tickets').add(payload);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Drying Ticket')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(children: [
          TextField(controller: _bedCtrl, decoration: const InputDecoration(labelText: 'Bed')),
          TextField(controller: _gradeCtrl, decoration: const InputDecoration(labelText: 'Grade')),
          TextField(controller: _moistureStartCtrl, decoration: const InputDecoration(labelText: 'Moisture Start'), keyboardType: TextInputType.number),
          TextField(controller: _moistureEndCtrl, decoration: const InputDecoration(labelText: 'Moisture End'), keyboardType: TextInputType.number),
          TextField(controller: _dryQtyCtrl, decoration: const InputDecoration(labelText: 'Dry Qty'), keyboardType: TextInputType.number),
          DropdownButtonFormField<String>(value: _qcStatus, items: const [
            DropdownMenuItem(value: 'Pending', child: Text('Pending')),
            DropdownMenuItem(value: 'Pass', child: Text('Pass')),
            DropdownMenuItem(value: 'Fail', child: Text('Fail')),
          ], onChanged: (v) => setState(() => _qcStatus = v ?? 'Pending'), decoration: const InputDecoration(labelText: 'QC Status')),
          TextField(controller: _qcGradeCtrl, decoration: const InputDecoration(labelText: 'QC Grade')),
          TextField(controller: _feedbackCtrl, decoration: const InputDecoration(labelText: 'Feedback')),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _submit, child: const Text('Create Ticket'))
        ]),
      ),
    );
  }
}
