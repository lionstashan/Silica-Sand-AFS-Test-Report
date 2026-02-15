class UserRoles {
  final List<String> roles;
  UserRoles(this.roles);

  static const allowed = [
    'worker', 'mining', 'production', 'qc', 'drying', 'dispatch', 'accounts', 'director'
  ];

  bool has(String role) {
    final r = role.toLowerCase();
    return roles.map((e) => e.toLowerCase()).contains(r) || isDirector;
  }

  bool get isDirector => roles.map((e) => e.toLowerCase()).contains('director');
}
