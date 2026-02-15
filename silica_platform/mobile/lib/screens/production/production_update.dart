import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/role_guard.dart';

class ProductionUpdateScreen extends StatefulWidget {
  const ProductionUpdateScreen({super.key});
  @override
  State<ProductionUpdateScreen> createState() => _ProductionUpdateScreenState();
}

class _ProductionUpdateScreenState extends State<ProductionUpdateScreen> {
  String? id;
  final _gradeCtl = TextEditingController();
  final _notesCtl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    id ??= ModalRoute.of(context)?.settings.arguments as String?;
  }

  Future<void> _call(String action) async {
    final theId = id ?? '';
    final path = '/api/production/$theId/$action';
    try {
      final res = await ApiClient.instance.patch(path, { 'grade': _gradeCtl.text, 'notes': _notesCtl.text });
      final ok = res.statusCode < 300;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok ? 'Success' : 'Failed: ${res.body}')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Update Production')),
      body: RoleGuard(
        roles: const ['production','director'],
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextField(controller: _gradeCtl, decoration: const InputDecoration(labelText: 'Grade')), 
              TextField(controller: _notesCtl, decoration: const InputDecoration(labelText: 'Notes')), 
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _call('qc-request'), child: const Text('Request QC')),
              ElevatedButton(onPressed: () => _call('qc-pass'), child: const Text('QC Pass')),
              ElevatedButton(onPressed: () => _call('qc-fail'), child: const Text('QC Fail')),
            ],
          ),
        ),
      ),
    );
  }
}
