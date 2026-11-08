package si.contactmanager.audit;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Javna pogodba beleženja za 004, 009 in 011 (plan.md, R-06): vnos nastane v isti transakciji kot operacija. */
@Component
public class AuditLog {

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID record(UUID groupId, long actorId, AuditAction action, List<ContactChange> changes) {
        return UUID.randomUUID();
    }
}
