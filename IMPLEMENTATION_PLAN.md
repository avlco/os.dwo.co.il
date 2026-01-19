# Implementation Plan: Critical Fixes for Client & Case Management

**Date:** 2026-01-19
**Branch:** claude/review-system-code-FddJT
**Estimated Time:** 50 minutes
**Status:** Ready for Execution

---

## 🎯 Implementation Strategy

This plan breaks down the implementation into 20 small tasks (2-5 minutes each).
Each task includes:
- Exact file path
- Exact line numbers
- Complete code to add/modify
- Verification steps

---

## 📦 PART 1: Clients.jsx Fixes (10 Tasks)

### Task 1.1: Import useToast hook
**File:** `src/pages/Clients.jsx`
**Location:** After line 43 (after Badge import)
**Time:** 1 minute

**Action:** Add import
```javascript
import { useToast } from "@/components/ui/use-toast";
```

**Verification:**
- No import errors
- File compiles

---

### Task 1.2: Initialize toast in component
**File:** `src/pages/Clients.jsx`
**Location:** After line 47 (after queryClient)
**Time:** 1 minute

**Action:** Add toast hook
```javascript
const { toast } = useToast();
```

**Verification:**
- Component renders without errors

---

### Task 1.3: Add success toast to createMutation
**File:** `src/pages/Clients.jsx`
**Location:** Lines 109-116 (inside createMutation)
**Time:** 2 minutes

**Action:** Modify onSuccess handler
```javascript
const createMutation = useMutation({
  mutationFn: (data) => base44.entities.Client.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "הלקוח נוסף בהצלחה",
      description: `הלקוח "${formData.name}" נוצר במערכת`,
    });
  },
});
```

**Verification:**
- Create a test client
- Toast appears with success message

---

### Task 1.4: Add error handler to createMutation
**File:** `src/pages/Clients.jsx`
**Location:** Lines 109-116 (inside createMutation, after onSuccess)
**Time:** 2 minutes

**Action:** Add onError handler
```javascript
const createMutation = useMutation({
  mutationFn: (data) => base44.entities.Client.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "הלקוח נוסף בהצלחה",
      description: `הלקוח "${formData.name}" נוצר במערכת`,
    });
  },
  onError: (error) => {
    console.error('Failed to create client:', error);
    toast({
      variant: "destructive",
      title: "שגיאה ביצירת לקוח",
      description: error.message || "אנא נסה שנית או פנה לתמיכה",
    });
  },
});
```

**Verification:**
- Force an error (e.g., network offline)
- Toast appears with error message
- Dialog stays open

---

### Task 1.5: Add toast to updateMutation
**File:** `src/pages/Clients.jsx`
**Location:** Lines 118-125 (inside updateMutation)
**Time:** 2 minutes

**Action:** Add toast notifications
```javascript
const updateMutation = useMutation({
  mutationFn: ({ id, data }) => base44.entities.Client.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "הלקוח עודכן בהצלחה",
      description: "השינויים נשמרו במערכת",
    });
  },
  onError: (error) => {
    console.error('Failed to update client:', error);
    toast({
      variant: "destructive",
      title: "שגיאה בעדכון לקוח",
      description: error.message || "אנא נסה שנית",
    });
  },
});
```

**Verification:**
- Edit existing client
- Toast appears on success/error

---

### Task 1.6: Create validation function
**File:** `src/pages/Clients.jsx`
**Location:** After line 153 (after resetForm function)
**Time:** 5 minutes

**Action:** Add validation function
```javascript
const validateClientForm = (data) => {
  const errors = [];

  // Required fields
  if (!data.name || data.name.trim() === '') {
    errors.push('שם הלקוח הוא שדה חובה');
  }

  // Email validation (if provided)
  if (data.email && data.email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push('כתובת האימייל אינה תקינה');
    }
  }

  // Phone validation (basic - if provided)
  if (data.phone && data.phone.trim() !== '') {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push('מספר הטלפון אינו תקין');
    }
  }

  // Hourly rate must be positive
  if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
    errors.push('תעריף שעתי חייב להיות מספר חיובי');
  }

  return errors;
};
```

**Verification:**
- Function exists
- No syntax errors

---

### Task 1.7: Add validation to handleSubmit
**File:** `src/pages/Clients.jsx`
**Location:** Lines 182-189 (inside handleSubmit)
**Time:** 3 minutes

**Action:** Replace handleSubmit with validated version
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Validate form
  const validationErrors = validateClientForm(formData);

  if (validationErrors.length > 0) {
    toast({
      variant: "destructive",
      title: "שגיאת ולידציה",
      description: validationErrors.join(', '),
    });
    return;
  }

  if (editingClient) {
    updateMutation.mutate({ id: editingClient.id, data: formData });
  } else {
    createMutation.mutate(formData);
  }
};
```

**Verification:**
- Try invalid email → see error toast
- Try negative hourly rate → see error toast
- Try empty name → see error toast

---

### Task 1.8: Add uniqueness check for client_number
**File:** `src/pages/Clients.jsx`
**Location:** Inside handleSubmit, after validation check
**Time:** 3 minutes

**Action:** Add uniqueness check
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Validate form
  const validationErrors = validateClientForm(formData);

  if (validationErrors.length > 0) {
    toast({
      variant: "destructive",
      title: "שגיאת ולידציה",
      description: validationErrors.join(', '),
    });
    return;
  }

  // Check uniqueness of client_number (only when creating or changing number)
  if (formData.client_number && formData.client_number.trim() !== '') {
    const isDuplicate = clients.some(c =>
      c.client_number === formData.client_number &&
      (!editingClient || c.id !== editingClient.id)
    );

    if (isDuplicate) {
      const duplicate = clients.find(c => c.client_number === formData.client_number);
      toast({
        variant: "destructive",
        title: "מספר לקוח כבר קיים",
        description: `הלקוח "${duplicate.name}" כבר משתמש במספר זה`,
      });
      return;
    }
  }

  if (editingClient) {
    updateMutation.mutate({ id: editingClient.id, data: formData });
  } else {
    createMutation.mutate(formData);
  }
};
```

**Verification:**
- Try creating client with duplicate client_number → see error
- Try unique client_number → success

---

### Task 1.9: Implement soft delete
**File:** `src/pages/Clients.jsx`
**Location:** Lines 127-132 (deleteMutation)
**Time:** 5 minutes

**Action:** Replace deleteMutation with soft delete
```javascript
const deleteMutation = useMutation({
  mutationFn: async (id) => {
    // Check if client has active cases
    const clientCases = cases.filter(c => c.client_id === id);

    if (clientCases.length > 0) {
      // Show warning with case count
      const confirmed = window.confirm(
        `ללקוח זה יש ${clientCases.length} תיקים פעילים.\n\n` +
        `סימון הלקוח כלא פעיל יסתיר אותו מהרשימות אך ישמור את התיקים.\n\n` +
        `האם להמשיך?`
      );

      if (!confirmed) {
        throw new Error('USER_CANCELLED');
      }
    }

    // Soft delete: set is_active to false
    return base44.entities.Client.update(id, { is_active: false });
  },
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    toast({
      title: "הלקוח סומן כלא פעיל",
      description: "הלקוח הוסתר מהרשימות אך הנתונים נשמרו",
    });
  },
  onError: (error) => {
    // Don't show error if user cancelled
    if (error.message !== 'USER_CANCELLED') {
      console.error('Failed to delete client:', error);
      toast({
        variant: "destructive",
        title: "שגיאה בעדכון סטטוס",
        description: error.message || "אנא נסה שנית",
      });
    }
  },
});
```

**Verification:**
- Delete client without cases → marked inactive, success toast
- Delete client with cases → confirmation dialog, then marked inactive
- Cancel deletion → no error toast, client remains active

---

### Task 1.10: Filter inactive clients from list
**File:** `src/pages/Clients.jsx`
**Location:** Lines 200-206 (filteredClients)
**Time:** 2 minutes

**Action:** Add is_active filter
```javascript
const filteredClients = clients.filter(c => {
  const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.client_number?.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesType = filterType === 'all' || c.type === filterType;
  const isActive = c.is_active !== false; // Filter out inactive clients
  return matchesSearch && matchesType && isActive;
});
```

**Verification:**
- Inactive clients don't appear in list
- Active clients appear normally

---

## 📦 PART 2: Cases.jsx Fixes (10 Tasks)

### Task 2.1: Import useToast hook
**File:** `src/pages/Cases.jsx`
**Location:** After line 46 (after Badge import)
**Time:** 1 minute

**Action:** Add import
```javascript
import { useToast } from "@/components/ui/use-toast";
```

**Verification:**
- No import errors

---

### Task 2.2: Initialize toast in component
**File:** `src/pages/Cases.jsx`
**Location:** After line 51 (after queryClient)
**Time:** 1 minute

**Action:** Add toast hook
```javascript
const { toast } = useToast();
```

**Verification:**
- Component renders

---

### Task 2.3: Add toast to createMutation
**File:** `src/pages/Cases.jsx`
**Location:** Lines 124-131 (createMutation)
**Time:** 2 minutes

**Action:** Add toast notifications
```javascript
const createMutation = useMutation({
  mutationFn: (data) => base44.entities.Case.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['cases']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "התיק נוסף בהצלחה",
      description: `התיק "${formData.case_number}" נוצר במערכת`,
    });
  },
  onError: (error) => {
    console.error('Failed to create case:', error);
    toast({
      variant: "destructive",
      title: "שגיאה ביצירת תיק",
      description: error.message || "אנא נסה שנית או פנה לתמיכה",
    });
  },
});
```

**Verification:**
- Create case → success toast
- Force error → error toast

---

### Task 2.4: Add toast to updateMutation
**File:** `src/pages/Cases.jsx`
**Location:** Lines 133-140 (updateMutation)
**Time:** 2 minutes

**Action:** Add toast notifications
```javascript
const updateMutation = useMutation({
  mutationFn: ({ id, data }) => base44.entities.Case.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries(['cases']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "התיק עודכן בהצלחה",
      description: "השינויים נשמרו במערכת",
    });
  },
  onError: (error) => {
    console.error('Failed to update case:', error);
    toast({
      variant: "destructive",
      title: "שגיאה בעדכון תיק",
      description: error.message || "אנא נסה שנית",
    });
  },
});
```

**Verification:**
- Update case → success/error toast

---

### Task 2.5: Add toast to deleteMutation
**File:** `src/pages/Cases.jsx`
**Location:** Lines 142-147 (deleteMutation)
**Time:** 2 minutes

**Action:** Add toast notifications
```javascript
const deleteMutation = useMutation({
  mutationFn: (id) => base44.entities.Case.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries(['cases']);
    toast({
      title: "התיק נמחק בהצלחה",
      description: "התיק הוסר מהמערכת",
    });
  },
  onError: (error) => {
    console.error('Failed to delete case:', error);
    toast({
      variant: "destructive",
      title: "שגיאה במחיקת תיק",
      description: error.message || "אנא נסה שנית",
    });
  },
});
```

**Verification:**
- Delete case → toast appears

---

### Task 2.6: Create validation function
**File:** `src/pages/Cases.jsx`
**Location:** After line 168 (after resetForm function)
**Time:** 5 minutes

**Action:** Add validation function
```javascript
const validateCaseForm = (data) => {
  const errors = [];

  // Required fields
  if (!data.case_number || data.case_number.trim() === '') {
    errors.push('מספר תיק הוא שדה חובה');
  }

  if (!data.title || data.title.trim() === '') {
    errors.push('שם הנכס הוא שדה חובה');
  }

  // Date logic validation
  if (data.filing_date && data.renewal_date) {
    const filing = new Date(data.filing_date);
    const renewal = new Date(data.renewal_date);

    if (renewal <= filing) {
      errors.push('תאריך חידוש חייב להיות אחרי תאריך ההגשה');
    }
  }

  if (data.filing_date && data.expiry_date) {
    const filing = new Date(data.filing_date);
    const expiry = new Date(data.expiry_date);

    if (expiry <= filing) {
      errors.push('תאריך פקיעה חייב להיות אחרי תאריך ההגשה');
    }
  }

  // Hourly rate validation
  if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
    errors.push('תעריף שעתי חייב להיות מספר חיובי');
  }

  return errors;
};
```

**Verification:**
- Function exists

---

### Task 2.7: Add validation to handleSubmit
**File:** `src/pages/Cases.jsx`
**Location:** Lines 197-210 (handleSubmit)
**Time:** 3 minutes

**Action:** Add validation logic
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Validate form
  const validationErrors = validateCaseForm(formData);

  if (validationErrors.length > 0) {
    toast({
      variant: "destructive",
      title: "שגיאת ולידציה",
      description: validationErrors.join(', '),
    });
    return;
  }

  const submitData = { ...formData };

  // Convert empty strings to null for optional fields
  if (!submitData.hourly_rate) submitData.hourly_rate = null;
  if (!submitData.assigned_lawyer_id) submitData.assigned_lawyer_id = null;
  if (!submitData.client_id) submitData.client_id = null;
  if (!submitData.filing_date || submitData.filing_date === '') submitData.filing_date = null;
  if (!submitData.expiry_date || submitData.expiry_date === '') submitData.expiry_date = null;
  if (!submitData.renewal_date || submitData.renewal_date === '') submitData.renewal_date = null;
  if (!submitData.official_status_date || submitData.official_status_date === '') submitData.official_status_date = null;

  if (editingCase) {
    updateMutation.mutate({ id: editingCase.id, data: submitData });
  } else {
    createMutation.mutate(submitData);
  }
};
```

**Verification:**
- Invalid dates → error toast
- Empty required fields → error toast

---

### Task 2.8: Add uniqueness check for case_number
**File:** `src/pages/Cases.jsx`
**Location:** Inside handleSubmit, after validation
**Time:** 3 minutes

**Action:** Add uniqueness check
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Validate form
  const validationErrors = validateCaseForm(formData);

  if (validationErrors.length > 0) {
    toast({
      variant: "destructive",
      title: "שגיאת ולידציה",
      description: validationErrors.join(', '),
    });
    return;
  }

  // Check uniqueness of case_number
  const isDuplicate = cases.some(c =>
    c.case_number === formData.case_number &&
    (!editingCase || c.id !== editingCase.id)
  );

  if (isDuplicate) {
    toast({
      variant: "destructive",
      title: "מספר תיק כבר קיים",
      description: `קיים כבר תיק במספר "${formData.case_number}"`,
    });
    return;
  }

  const submitData = { ...formData };

  // Convert empty strings to null for optional fields
  if (!submitData.hourly_rate) submitData.hourly_rate = null;
  if (!submitData.assigned_lawyer_id) submitData.assigned_lawyer_id = null;
  if (!submitData.client_id) submitData.client_id = null;
  if (!submitData.filing_date || submitData.filing_date === '') submitData.filing_date = null;
  if (!submitData.expiry_date || submitData.expiry_date === '') submitData.expiry_date = null;
  if (!submitData.renewal_date || submitData.renewal_date === '') submitData.renewal_date = null;
  if (!submitData.official_status_date || submitData.official_status_date === '') submitData.official_status_date = null;

  if (editingCase) {
    updateMutation.mutate({ id: editingCase.id, data: submitData });
  } else {
    createMutation.mutate(submitData);
  }
};
```

**Verification:**
- Duplicate case_number → error
- Unique case_number → success

---

### Task 2.9: Add console.error for debugging
**File:** `src/pages/Cases.jsx`
**Location:** Already done in previous tasks
**Time:** 0 minutes (already included)

**Verification:** Skip - already done

---

### Task 2.10: Verify all date fields handle null properly
**File:** `src/pages/Cases.jsx`
**Location:** handleSubmit (already done in Task 2.7)
**Time:** 0 minutes (already included)

**Verification:** Skip - already done

---

## ✅ Final Verification Checklist

After completing all tasks, verify:

### Clients.jsx
- [ ] Toast appears on create success
- [ ] Toast appears on create error
- [ ] Toast appears on update success
- [ ] Toast appears on update error
- [ ] Toast appears on delete (soft delete)
- [ ] Invalid email shows validation error
- [ ] Invalid phone shows validation error
- [ ] Duplicate client_number rejected
- [ ] Soft delete asks for confirmation with case count
- [ ] Inactive clients don't appear in list

### Cases.jsx
- [ ] Toast appears on create success
- [ ] Toast appears on create error
- [ ] Toast appears on update success
- [ ] Toast appears on update error
- [ ] Toast appears on delete
- [ ] Invalid date logic rejected (renewal before filing)
- [ ] Duplicate case_number rejected
- [ ] Empty required fields rejected
- [ ] Date fields properly handle null values

### General
- [ ] No console errors
- [ ] All toasts display correctly in Hebrew
- [ ] Dialog closes on success
- [ ] Dialog stays open on error
- [ ] Loading states work properly

---

## 🔄 Rollback Plan

If issues arise:

```bash
# Discard all changes
git checkout -- src/pages/Clients.jsx src/pages/Cases.jsx

# Or revert specific file
git checkout -- src/pages/Clients.jsx
```

---

## 📊 Success Criteria

**Definition of Done:**
1. All 20 tasks completed
2. All verification checkboxes checked
3. Manual testing passes all scenarios
4. No console errors
5. Code committed and pushed

**Ready for code review after completion.**
